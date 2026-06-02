import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import { X } from "lucide-react";
import type { Channel } from "wukongimjssdk";
import { Button } from "@/components/semi-bridge/button";
import { toast } from "@/components/semi-bridge/toast";
import { authStore } from "@/features/base/stores/auth";
import { spaceStore } from "@/features/base/stores/space";
import { createMatter } from "@/features/matter/api/matter.api";
import { mattersListInfiniteQueryKey } from "@/features/matter/queries/matters.query";
import { MatterFormBody } from "@/features/matter/components/matter-form-body";
import {
  buildDeadlineISO,
  isMatterFormValid,
  type MatterFormValues,
} from "@/features/matter/lib/matter-form";
import type { CreateMatterReq, MatterDetail } from "@/features/matter/types/matter.types";

interface CreateMatterModalProps {
  open: boolean;
  onClose: () => void;
  /** 创建成功后回调,view 层用来选中刚创建的事项。 */
  onCreated?: (matter: MatterDetail) => void;
  /**
   * 来源会话(chat ✓ / Alt+Enter 触发时传入,候选成员限定本群 + 透传 source_channel_*)。
   * matter.view + 按钮新建时不传 → 候选 Space 全员、不带 source channel。
   */
  sourceChannel?: { channel: Channel; name?: string };
}

const INITIAL_VALUES = (myUid: string): MatterFormValues => ({
  title: "",
  description: "",
  assigneeUids: myUid ? [myUid] : [],
  deadline: "",
});

/** open 翻起重置表单 — 默认 prefill 当前用户为负责人(对齐旧 SmartCreateModal blank 模式)。 */
function useResetFormOnOpen(
  open: boolean,
  myUid: string,
  set: (v: MatterFormValues) => void,
): void {
  useEffect(() => {
    if (open) set(INITIAL_VALUES(myUid));
    // setter 稳定,只追 open + myUid
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, myUid]);
}

/** Esc 关弹(dirty 时关由 view 层 confirm)。 */
function useEscClose(open: boolean, onCancel: () => void): void {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);
}

/**
 * 创建事项弹窗(1:1 对齐旧 dmworktodo CreateTaskModal 4 字段表单):
 *
 * 触发路径:
 * - matter.view + 按钮新建(无 sourceChannel)
 * - chat ✓ / Alt+Enter(传 sourceChannel → 候选限本群 + 透传 source_channel_*)
 *
 * 字段 / 交互(全部由共享 MatterFormBody 提供):
 *   ① 事项名称(200 字)+ autofocus 50ms
 *   ② 主要目标(200 字 + 计数)
 *   ③ 负责人(MemberSelect — sourceChannel 时本群,否则 Space)
 *   ④ Deadline(date,today+)
 * 全必填校验通过才能 "确定";dirty 时关闭弹 confirm;Esc 关。
 */
export function CreateMatterModal({
  open,
  onClose,
  onCreated,
  sourceChannel,
}: CreateMatterModalProps) {
  const qc = useQueryClient();
  const myUid = useStore(authStore, (s) => s.user?.uid ?? "");
  const spaceId = useStore(spaceStore, (s) => s.spaceId);

  const [values, setValues] = useState<MatterFormValues>(INITIAL_VALUES(myUid));
  const [confirmDirtyClose, setConfirmDirtyClose] = useState(false);

  useResetFormOnOpen(open, myUid, setValues);

  const mu = useMutation({
    mutationFn: (req: CreateMatterReq) => createMatter(req),
    onSuccess: (matter) => {
      void qc.invalidateQueries({ queryKey: mattersListInfiniteQueryKey(spaceId, undefined) });
      void qc.invalidateQueries({ queryKey: ["matter", "list"] });
      toast.success("已添加");
      onCreated?.(matter);
      onClose();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "创建事项失败"),
  });

  // dirty:相对"打开初始态"(prefill 自己 + 空字段);只看用户主动改了什么
  const initialAssigneesKey = myUid ? myUid : "";
  const currentAssigneesKey = [...values.assigneeUids].sort().join(",");
  const isDirty =
    values.title.trim().length > 0 ||
    values.description.trim().length > 0 ||
    currentAssigneesKey !== initialAssigneesKey ||
    values.deadline !== "";

  const canSubmit = !mu.isPending && isMatterFormValid(values);

  const handleClose = () => {
    if (mu.isPending) return;
    if (isDirty) setConfirmDirtyClose(true);
    else onClose();
  };

  useEscClose(open, handleClose);

  const handleSubmit = () => {
    if (!canSubmit) return;
    mu.mutate({
      title: values.title.trim(),
      description: values.description.trim(),
      assignee_ids: values.assigneeUids,
      deadline: buildDeadlineISO(values.deadline),
      source_channel_id: sourceChannel?.channel.channelID,
      source_channel_type: sourceChannel?.channel.channelType,
      source_name: sourceChannel?.name,
    });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !e.altKey) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "TEXTAREA") return;
      if (tag === "INPUT") {
        e.preventDefault();
        if (canSubmit) handleSubmit();
      }
    }
  };

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
        onClick={(e) => e.target === e.currentTarget && handleClose()}
        onKeyDown={onKeyDown}
      >
        <div className="flex w-[480px] max-w-full flex-col rounded-lg bg-bg-surface shadow-xl ring-1 ring-brand/10">
          <header className="flex items-center justify-between p-4">
            <h3 className="m-0 text-base font-semibold text-text-strong">新建事项:</h3>
            <button
              type="button"
              onClick={handleClose}
              aria-label="关闭"
              className="flex h-6 w-6 items-center justify-center rounded-sm text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-primary"
            >
              <X size={16} />
            </button>
          </header>

          <div className="flex flex-col gap-4 px-4 py-[10px]">
            <MatterFormBody
              values={values}
              onChange={(patch) => setValues((prev) => ({ ...prev, ...patch }))}
              channel={sourceChannel?.channel}
              autoFocus
            />
          </div>

          <footer className="flex items-center justify-end gap-3 p-4">
            <button
              type="button"
              onClick={handleClose}
              className="inline-flex h-7 items-center rounded-full border border-brand/10 bg-bg-surface px-3 text-[13px] font-semibold text-text-strong transition-colors hover:bg-bg-hover"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="inline-flex h-7 items-center rounded-full bg-brand px-3 text-[13px] font-semibold text-text-inverse transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {mu.isPending ? "创建中..." : "确定"}
            </button>
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
