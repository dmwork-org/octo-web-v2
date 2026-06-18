import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import type { Channel } from "wukongimjssdk";
import { toast } from "@/components/semi-bridge/toast";
import { useT } from "@/lib/i18n/use-t";
import { t } from "@/lib/i18n/instance";
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
import { BaseDialog } from "@/features/base/components/overlay/base-dialog";
import { ConfirmDialog } from "@/features/base/components/overlay/confirm-dialog";

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

/** open 翻起重置表单 — 默认 prefill 当前用户为负责人。 */
function useResetFormOnOpen(
  open: boolean,
  myUid: string,
  set: (v: MatterFormValues) => void,
): void {
  useEffect(() => {
    if (open) set(INITIAL_VALUES(myUid));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, myUid]);
}

/**
 * 创建事项弹窗(1:1 对齐旧 dmworktodo CreateTaskModal 4 字段表单)。
 *
 * 浮动元素壳层统一规范 Phase C3 — 走 BaseDialog;dirty 时关闭弹 ConfirmDialog
 * (自动嵌套 z-dialog-secondary)。
 */
export function CreateMatterModal({
  open,
  onClose,
  onCreated,
  sourceChannel,
}: CreateMatterModalProps) {
  const tr = useT();
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
      toast.success(t("matter.toast.added"));
      onCreated?.(matter);
      onClose();
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("matter.toast.createMatterFailed")),
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

  return (
    <>
      <BaseDialog
        open={open}
        onOpenChange={(next) => {
          if (!next) handleClose();
        }}
        size="fit"
        title={tr("matter.action.new")}
        className="w-[480px] max-w-full"
        contentClassName="px-4 py-[10px]"
        shouldPreventOutsideClose={(e) => {
          const dropdown = document.getElementById("member-select-dropdown");
          return !!(dropdown && dropdown.contains(e.target as Node));
        }}
        footer={
          <>
            <button
              type="button"
              onClick={handleClose}
              className="inline-flex h-7 items-center rounded-full border border-brand/10 bg-bg-surface px-3 text-[13px] font-semibold text-text-strong transition-colors hover:bg-bg-hover"
            >
              {tr("matter.common.cancel")}
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="inline-flex h-7 items-center rounded-full bg-brand px-3 text-[13px] font-semibold text-text-inverse transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {mu.isPending ? tr("matter.action.creating") : tr("matter.common.confirm")}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-4" onKeyDown={onKeyDown}>
          <MatterFormBody
            values={values}
            onChange={(patch) => setValues((prev) => ({ ...prev, ...patch }))}
            channel={sourceChannel?.channel}
            autoFocus
          />
        </div>
      </BaseDialog>

      <ConfirmDialog
        open={confirmDirtyClose}
        onOpenChange={(next) => !next && setConfirmDirtyClose(false)}
        content={tr("matter.confirm.discardUnsaved")}
        okText={tr("matter.action.close")}
        okDanger
        cancelText={tr("matter.action.keepEditing")}
        onOk={() => {
          setConfirmDirtyClose(false);
          onClose();
        }}
        onCancel={() => setConfirmDirtyClose(false)}
      />
    </>
  );
}
