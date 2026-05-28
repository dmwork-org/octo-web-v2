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
import { UserName } from "@/features/matter/components/user-name";
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

/** Esc 关闭弹窗。dirty 时关闭交给 view 层 confirm。 */
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
 * 创建事项弹窗(对齐原 dmworktodo CreateTaskModal + 设计稿 4 字段表单):
 *
 *   ┌─ 新建事项:                                       ✕
 *   │  事项名称*    [_____________________________]
 *   │  主要目标*    [textarea 一句话说清这件事        ]
 *   │                                          0/200
 *   │  负责人*      [chip [头像] 名字 ×] ←点空白弹候选
 *   │  Deadline*    [请选择                       📅]
 *   ├──────────────────────────────────────────────────────
 *   │                              [取消]   [确定]
 *   └─
 *
 * 4 字段全必填(对齐原项目),全填齐才允许"确定"。dirty 时关闭弹 confirm。
 *
 * 与原项目差异(P3+ 留):
 * - 描述用纯 textarea(原也是 textarea,详情面板才升级 TipTap)
 * - 不接 VoiceInputButton 麦克风(@octo/base 跨 feature)
 * - 不接 source channel / sendOnConfirm(SmartCreate / chat 集成)
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
  const [assigneePopoverOpen, setAssigneePopoverOpen] = useState(false);
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

  const removeAssignee = (uid: string) => {
    setAssigneeUids((prev) => prev.filter((u) => u !== uid));
  };

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
        onClick={(e) => e.target === e.currentTarget && handleClose()}
      >
        <div className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-bg-surface shadow-xl">
          <header className="flex shrink-0 items-center justify-between px-6 pt-5 pb-3">
            <h2 className="text-base font-semibold text-text-primary">新建事项:</h2>
            <button
              type="button"
              onClick={handleClose}
              aria-label="关闭"
              className="flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
            >
              <X size={18} />
            </button>
          </header>

          <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-6 py-2">
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
                className="w-full rounded-md border border-transparent bg-bg-elevated px-3 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus:border-brand focus:bg-bg-base focus:outline-none"
              />
            </Field>

            <Field label="主要目标" required>
              <div className="relative rounded-md bg-bg-elevated focus-within:bg-bg-base">
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value.slice(0, DESC_MAX))}
                  placeholder="一句话说清这件事"
                  rows={3}
                  className="w-full resize-none rounded-md border border-transparent bg-transparent px-3 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus:border-brand focus:outline-none"
                />
                <span className="absolute right-3 bottom-2 text-[11px] text-text-tertiary">
                  {description.length}/{DESC_MAX}
                </span>
              </div>
            </Field>

            <Field label="负责人" required>
              <Popover open={assigneePopoverOpen} onOpenChange={setAssigneePopoverOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="flex min-h-[42px] w-full flex-wrap items-center gap-1.5 rounded-md border border-transparent bg-bg-elevated px-2.5 py-2 text-left text-sm text-text-primary hover:bg-bg-hover focus:border-brand focus:outline-none aria-expanded:border-brand"
                  >
                    {assigneeUids.length === 0 ? (
                      <span className="px-1 text-text-tertiary">请选择</span>
                    ) : (
                      assigneeUids.map((uid) => (
                        <span
                          key={uid}
                          className="inline-flex items-center gap-1 rounded-md bg-bg-surface py-0.5 pr-1 pl-1 ring-1 ring-border-subtle"
                        >
                          <ChannelAvatar
                            channel={new Channel(uid, ChannelTypePerson)}
                            size={20}
                            title={uid}
                          />
                          <UserName uid={uid} className="text-text-primary" />
                          <span
                            role="button"
                            tabIndex={0}
                            aria-label={`移除 ${uid}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              removeAssignee(uid);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                e.stopPropagation();
                                removeAssignee(uid);
                              }
                            }}
                            className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded text-text-tertiary hover:bg-bg-elevated hover:text-text-primary"
                          >
                            <X size={10} />
                          </span>
                        </span>
                      ))
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  className="max-h-64 w-[var(--radix-popover-trigger-width)] overflow-y-auto p-1"
                  align="start"
                >
                  {candidates.length === 0 ? (
                    <p className="px-2 py-3 text-center text-xs text-text-tertiary">
                      当前 Space 没有可选成员
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-0.5">
                      {candidates.map((m) => {
                        const checked = assigneeUids.includes(m.uid);
                        return (
                          <li key={m.uid}>
                            <button
                              type="button"
                              onClick={() => toggleAssignee(m.uid)}
                              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-bg-hover ${
                                checked ? "bg-brand-tint" : ""
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                readOnly
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
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </PopoverContent>
              </Popover>
            </Field>

            <Field label="Deadline" required>
              <Popover open={datePopoverOpen} onOpenChange={setDatePopoverOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-md border border-transparent bg-bg-elevated px-3 py-2.5 text-left text-sm text-text-primary hover:bg-bg-hover focus:border-brand focus:outline-none aria-expanded:border-brand"
                  >
                    {deadline ? (
                      formatDateLabel(deadline)
                    ) : (
                      <span className="text-text-tertiary">请选择</span>
                    )}
                    <CalendarDays size={16} className="text-text-tertiary" />
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

          <footer className="flex shrink-0 items-center justify-end gap-3 px-6 pt-3 pb-5">
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
    <div className="flex flex-col gap-2">
      <label className="text-sm font-semibold text-text-primary">
        {label}
        {required ? <span className="ml-1 text-error">*</span> : null}
      </label>
      {children}
    </div>
  );
}
