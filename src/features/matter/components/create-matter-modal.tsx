import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import { CalendarDays, X } from "lucide-react";
import { Button } from "@/components/semi-bridge/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/components/semi-bridge/toast";
import { authStore } from "@/features/base/stores/auth";
import { spaceStore } from "@/features/base/stores/space";
import { createMatter } from "@/features/matter/api/matter.api";
import { mattersListInfiniteQueryKey } from "@/features/matter/queries/matters.query";
import { MemberPicker } from "@/features/matter/components/member-picker";
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
  setTitle: (v: string) => void;
  setDescription: (v: string) => void;
  setAssigneeUids: (v: string[]) => void;
  setDeadline: (v: Date | undefined) => void;
}

/**
 * open 翻转时重置表单字段(命名 hook,符合 no-useeffect-in-component)。
 * 默认 prefill 当前用户为负责人(对齐原 SmartCreateModal blank 模式)。
 */
function useResetFormOnOpen(open: boolean, myUid: string, form: FormState) {
  useEffect(() => {
    if (open) {
      form.setTitle("");
      form.setDescription("");
      form.setAssigneeUids(myUid ? [myUid] : []);
      form.setDeadline(undefined);
    }
    // form setters 在 useState 后稳定,只追 open + myUid
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, myUid]);
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
 * 创建事项弹窗(对齐原 dmworktodo SmartCreateModal blank 模式 4 字段表单):
 *
 *   ┌─ 新建事项:                                       ✕
 *   │  事项名称*    [_____________________________]
 *   │  主要目标*    [textarea + 0/200 计数]
 *   │  负责人*      [chip [头像] 自己 ✕]  ← 默认含当前用户
 *   │  Deadline*    [请选择                       📅]
 *   ├──────────────────────────────────────────────────────
 *   │                              [取消]   [确定]
 *   └─
 *
 * 对齐原项目关键交互:
 * - 打开默认 setAssigneeUids([currentUid])(blank 模式 prefill 自己,见
 *   SmartCreateModal/index.tsx:84)
 * - 负责人用 MemberPicker(wrapper + chip + inline 搜索 input + dropdown,
 *   见 ui/MemberPicker/index.tsx)
 * - 4 字段全必填,全填齐才允许"确定"
 * - dirty 时关闭弹 confirm(已填内容会丢失)
 *
 * 与原项目差异(P3+ 留):
 * - 描述用纯 textarea(原也是 textarea,详情面板才升级 TipTap)
 * - 不接 VoiceInputButton 麦克风(@octo/base 跨 feature)
 * - 不接 source channel / sendOnConfirm(SmartCreate / chat 集成)
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

  useResetFormOnOpen(open, myUid, {
    setTitle,
    setDescription,
    setAssigneeUids,
    setDeadline,
  });
  useFocusOnOpen(open, titleRef);

  const mu = useMutation({
    mutationFn: (req: CreateMatterReq) => createMatter(req),
    onSuccess: (matter) => {
      void qc.invalidateQueries({ queryKey: mattersListInfiniteQueryKey(spaceId, undefined) });
      void qc.invalidateQueries({ queryKey: ["matter", "list"] });
      toast.success("已添加");
      onCreated(matter);
    },
  });

  // dirty:对比"打开时的初始态"(prefill 自己 + 空字段);只看用户主动改了什么
  const initialAssigneesKey = myUid ? myUid : "";
  const currentAssigneesKey = assigneeUids.slice().sort().join(",");
  const isDirty =
    title.trim().length > 0 ||
    description.trim().length > 0 ||
    currentAssigneesKey !== initialAssigneesKey ||
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

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
        onClick={(e) => e.target === e.currentTarget && handleClose()}
      >
        <div className="flex max-h-[85vh] w-full max-w-md flex-col overflow-visible rounded-2xl bg-bg-surface shadow-xl">
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

          <div className="flex flex-1 flex-col gap-5 overflow-visible px-6 py-2">
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
              <MemberPicker value={assigneeUids} onChange={setAssigneeUids} placeholder="请选择" />
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
