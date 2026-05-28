import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import { Channel, ChannelTypePerson } from "wukongimjssdk";
import { CalendarDays, X } from "lucide-react";
import { Button } from "@/components/semi-bridge/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/components/semi-bridge/toast";
import { authStore } from "@/features/base/stores/auth";
import { spaceStore } from "@/features/base/stores/space";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { spaceMembersQueryOptions } from "@/features/contacts/queries/directory.query";
import { createMatter } from "@/features/matter/api/matter.api";
import { mattersListInfiniteQueryKey } from "@/features/matter/queries/matters.query";
import type { CreateMatterReq, MatterDetail } from "@/features/matter/types/matter.types";

interface CreateMatterModalProps {
  open: boolean;
  onClose: () => void;
  /** 创建成功后回调,view 层用来选中刚创建的事项。 */
  onCreated: (matter: MatterDetail) => void;
}

function formatDateLabel(d: Date): string {
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

/** 把本地 Date 转 ISO 字符串(本地午夜),与 DeadlinePicker 一致。 */
function toIsoLocalMidnight(d: Date): string {
  const local = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
  return local.toISOString();
}

const TITLE_MAX = 200;
const DESC_MAX = 200;

interface FormState {
  title: string;
  description: string;
  assigneeUids: string[];
  deadline: Date | undefined;
  setTitle: (v: string) => void;
  setDescription: (v: string) => void;
  setAssigneeUids: (v: string[]) => void;
  setDeadline: (v: Date | undefined) => void;
}

/** open 翻转时重置表单字段(命名 hook,符合 no-useeffect-in-component)。 */
function useResetFormOnOpen(open: boolean, form: FormState) {
  useEffect(() => {
    if (open) {
      form.setTitle("");
      form.setDescription("");
      form.setAssigneeUids([]);
      form.setDeadline(undefined);
    }
    // form setters 在 useState 后稳定,只追 open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}

/**
 * Esc 关闭弹窗。dirty 时关闭交给 view 层 confirm。
 */
function useEscClose(open: boolean, onCancel: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onCancel]);
}

/** Modal 打开时聚焦标题输入框。 */
function useFocusOnOpen(open: boolean, ref: React.RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => ref.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open, ref]);
}

/**
 * 创建事项弹窗(对齐原 dmworktodo CreateTaskModal 的 4 字段表单):
 *
 *   ┌─ 新建事项                                          ✕
 *   │  事项名称*    [_____________________________]
 *   │  主要目标*    [textarea 200 字符 + 计数]
 *   │  负责人*      [成员复选列表]
 *   │  Deadline*    [📅 选日期(Calendar popover)]
 *   ├──────────────────────────────────────────────────────
 *   │                              [取消]   [确定]
 *   └─
 *
 * 4 字段全必填(对齐原项目),全填齐才允许"确定"。dirty 时关闭弹 confirm。
 *
 * 与原项目差异:
 * - 描述用纯 textarea(原也是 textarea,详情面板才升级 TipTap)
 * - 不接 VoiceInputButton(@octo/base 跨 feature,P3+)
 * - 不接 source channel / sendOnConfirm(SmartCreate / chat 集成,P3+)
 *
 * 创建成功 invalidate matter list + onCreated 回调。
 */
export function CreateMatterModal({ open, onClose, onCreated }: CreateMatterModalProps) {
  const qc = useQueryClient();
  const myUid = useStore(authStore, (s) => s.user?.uid ?? "");
  const spaceId = useStore(spaceStore, (s) => s.spaceId);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeUids, setAssigneeUids] = useState<string[]>([]);
  const [deadline, setDeadline] = useState<Date | undefined>(undefined);
  const [datePopoverOpen, setDatePopoverOpen] = useState(false);
  const [confirmDirtyClose, setConfirmDirtyClose] = useState(false);

  const titleRef = useRef<HTMLInputElement>(null);

  useResetFormOnOpen(open, {
    title,
    description,
    assigneeUids,
    deadline,
    setTitle,
    setDescription,
    setAssigneeUids,
    setDeadline,
  });
  useFocusOnOpen(open, titleRef);

  const { data: members } = useQuery({
    ...spaceMembersQueryOptions(spaceId),
    enabled: open && !!spaceId,
  });

  const candidates = useMemo(
    () => (members ?? []).filter((m) => m.uid !== myUid && m.robot !== 1),
    [members, myUid],
  );

  const mu = useMutation({
    mutationFn: (req: CreateMatterReq) => createMatter(req),
    onSuccess: (matter) => {
      void qc.invalidateQueries({ queryKey: mattersListInfiniteQueryKey(spaceId, undefined) });
      void qc.invalidateQueries({ queryKey: ["matter", "list"] });
      toast.success("已添加");
      onCreated(matter);
    },
  });

  const isDirty =
    title.trim().length > 0 ||
    description.trim().length > 0 ||
    assigneeUids.length > 0 ||
    deadline !== undefined;

  const canSubmit =
    !mu.isPending &&
    title.trim().length > 0 &&
    description.trim().length > 0 &&
    assigneeUids.length > 0 &&
    deadline !== undefined;

  const handleClose = () => {
    if (mu.isPending) return;
    if (isDirty) {
      setConfirmDirtyClose(true);
    } else {
      onClose();
    }
  };

  useEscClose(open, handleClose);

  const handleSubmit = () => {
    if (!canSubmit || !deadline) return;
    mu.mutate({
      title: title.trim(),
      description: description.trim(),
      assignee_ids: assigneeUids,
      deadline: toIsoLocalMidnight(deadline),
    });
  };

  const toggleAssignee = (uid: string) => {
    setAssigneeUids((prev) =>
      prev.includes(uid) ? prev.filter((u) => u !== uid) : [...prev, uid],
    );
  };

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
        onClick={(e) => e.target === e.currentTarget && handleClose()}
      >
        <div className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-lg border border-border-default bg-bg-surface shadow-xl">
          <header className="flex shrink-0 items-center justify-between border-b border-border-subtle px-5 py-3">
            <h2 className="text-sm font-semibold text-text-primary">新建事项</h2>
            <button
              type="button"
              onClick={handleClose}
              aria-label="关闭"
              className="flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
            >
              <X size={16} />
            </button>
          </header>

          <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
            <Field label="事项名称" required>
              <input
                ref={titleRef}
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value.slice(0, TITLE_MAX))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (canSubmit) handleSubmit();
                  }
                }}
                placeholder="请输入"
                className="w-full rounded-md border border-border-subtle bg-bg-base px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-brand focus:outline-none"
              />
            </Field>

            <Field label="主要目标" required>
              <div className="relative">
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value.slice(0, DESC_MAX))}
                  placeholder="一句话说清这件事"
                  rows={3}
                  className="w-full resize-none rounded-md border border-border-subtle bg-bg-base px-3 py-2 pr-14 text-sm text-text-primary placeholder:text-text-tertiary focus:border-brand focus:outline-none"
                />
                <span className="absolute right-3 bottom-2 text-[11px] text-text-tertiary">
                  {description.length}/{DESC_MAX}
                </span>
              </div>
            </Field>

            <Field label="负责人" required>
              {candidates.length === 0 ? (
                <p className="text-xs text-text-tertiary">当前 Space 没有可选成员</p>
              ) : (
                <div className="flex max-h-48 flex-col gap-0.5 overflow-y-auto rounded-md border border-border-subtle bg-bg-base p-1">
                  {candidates.map((m) => {
                    const checked = assigneeUids.includes(m.uid);
                    return (
                      <label
                        key={m.uid}
                        className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-bg-hover ${
                          checked ? "bg-brand-tint" : ""
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleAssignee(m.uid)}
                          className="shrink-0"
                        />
                        <ChannelAvatar
                          channel={new Channel(m.uid, ChannelTypePerson)}
                          size={24}
                          title={m.name}
                        />
                        <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                          {m.name || m.uid}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </Field>

            <Field label="Deadline" required>
              <Popover open={datePopoverOpen} onOpenChange={setDatePopoverOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md border border-border-subtle bg-bg-base px-3 py-2 text-left text-sm text-text-primary hover:bg-bg-hover"
                  >
                    <CalendarDays size={14} className="text-text-tertiary" />
                    {deadline ? (
                      formatDateLabel(deadline)
                    ) : (
                      <span className="text-text-tertiary">请选择</span>
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={deadline}
                    onSelect={(d) => {
                      if (!d) return;
                      setDeadline(d);
                      setDatePopoverOpen(false);
                    }}
                    disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                  />
                </PopoverContent>
              </Popover>
            </Field>
          </div>

          <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-border-subtle px-5 py-3">
            <Button type="tertiary" theme="borderless" onClick={handleClose}>
              取消
            </Button>
            <Button
              type="primary"
              theme="solid"
              loading={mu.isPending}
              disabled={!canSubmit}
              onClick={handleSubmit}
            >
              确定
            </Button>
          </footer>
        </div>
      </div>

      {confirmDirtyClose ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
          <div className="flex w-full max-w-sm flex-col overflow-hidden rounded-lg border border-border-default bg-bg-surface shadow-xl">
            <div className="px-5 py-4 text-sm text-text-primary">已填写的内容会丢失,确认关闭?</div>
            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border-subtle px-5 py-3">
              <Button
                type="tertiary"
                theme="borderless"
                onClick={() => setConfirmDirtyClose(false)}
              >
                继续编辑
              </Button>
              <Button
                type="danger"
                theme="solid"
                onClick={() => {
                  setConfirmDirtyClose(false);
                  onClose();
                }}
              >
                关闭
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

interface FieldProps {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}

function Field({ label, required, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-text-secondary">
        {label}
        {required ? <span className="ml-0.5 text-error">*</span> : null}
      </label>
      {children}
    </div>
  );
}
