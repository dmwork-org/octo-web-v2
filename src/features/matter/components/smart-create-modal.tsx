import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import WKSDK, { Channel, ChannelTypePerson, type Message } from "wukongimjssdk";
import { Button } from "@/components/semi-bridge/button";
import { toast } from "@/components/semi-bridge/toast";
import { useT } from "@/lib/i18n/use-t";
import { t } from "@/lib/i18n/instance";
import { authStore } from "@/features/base/stores/auth";
import {
  addAssignee,
  extractMatter,
  getMatter,
  removeAssignee,
  updateMatter,
} from "@/features/matter/api/matter.api";
import { mattersListInfiniteQueryKey } from "@/features/matter/queries/matters.query";
import { spaceStore } from "@/features/base/stores/space";
import { MatterFormBody } from "@/features/matter/components/matter-form-body";
import {
  buildDeadlineISO,
  isMatterFormValid,
  type MatterFormValues,
} from "@/features/matter/lib/matter-form";
import type {
  ExtractMatterReq,
  ExtractMessage,
  ExtractResult,
} from "@/features/matter/types/matter.types";
import { BaseDialog } from "@/features/base/components/overlay/base-dialog";

interface SmartCreateModalProps {
  open: boolean;
  channel: Channel;
  channelName?: string;
  /** 必须非空 — 触发 AI 抽取的源消息(老仓 selection-toolbar "创建新事项")。 */
  messages: Message[];
  onClose: () => void;
}

function toExtractMsgs(msgs: Message[]): ExtractMessage[] {
  return msgs.map((m) => {
    const info = WKSDK.shared().channelManager.getChannelInfo(
      new Channel(m.fromUID, ChannelTypePerson),
    );
    return {
      message_id: m.messageID,
      from_uid: m.fromUID,
      from_uname: info?.title,
      timestamp: m.timestamp,
      content: m.content?.conversationDigest ?? "",
    };
  });
}

/**
 * AI 智能创建事项 modal — 对齐旧 dmworktodo SmartCreateModal。
 *
 * 浮动元素壳层统一规范 Phase C3 — 走 BaseDialog。
 */
export function SmartCreateModal({
  open,
  channel,
  channelName,
  messages,
  onClose,
}: SmartCreateModalProps) {
  const tr = useT();
  const qc = useQueryClient();
  const myUid = useStore(authStore, (s) => s.user?.uid ?? "");
  const spaceId = useStore(spaceStore, (s) => s.spaceId);

  const [draftId, setDraftId] = useState<string | null>(null);
  const [values, setValues] = useState<MatterFormValues>(emptyValues(myUid));

  useResetOnOpen(open, myUid, setDraftId, setValues);

  const extractMu = useMutation({
    mutationFn: async (): Promise<ExtractResult> => {
      const req: ExtractMatterReq = {
        channel_type: channel.channelType,
        channel_id: channel.channelID,
        channel_name: channelName,
        creator_uid: myUid,
        msgs: toExtractMsgs(messages),
      };
      return extractMatter(req);
    },
    onSuccess: (result) => {
      setDraftId(result.id);
      setValues((prev) => ({
        ...prev,
        title: result.title || prev.title,
        description: result.description || prev.description,
      }));
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("matter.toast.aiExtractFailed")),
  });
  useTriggerExtract(open, !!draftId, extractMu.mutate);

  const saveMu = useMutation({
    mutationFn: async () => {
      if (!draftId) throw new Error(t("matter.toast.missingMatterId"));
      await updateMatter(draftId, {
        title: values.title.trim(),
        description: values.description.trim(),
        deadline: buildDeadlineISO(values.deadline),
      });
      const detail = await getMatter(draftId);
      const currentUids = new Set((detail.assignees ?? []).map((a) => a.user_id));
      const desiredUids = new Set(values.assigneeUids);
      const toAdd = [...desiredUids].filter((uid) => !currentUids.has(uid));
      const toRemove = [...currentUids].filter((uid) => !desiredUids.has(uid));
      await Promise.all([
        ...toAdd.map((uid) => addAssignee(draftId, uid)),
        ...toRemove.map((uid) => removeAssignee(draftId, uid)),
      ]);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: mattersListInfiniteQueryKey(spaceId, undefined) });
      void qc.invalidateQueries({ queryKey: ["matter", "list"] });
      toast.success(t("matter.toast.matterCreated"));
      onClose();
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("summary.common.saveFailed")),
  });

  const isExtracting = extractMu.isPending && !draftId;
  const canSave = !!draftId && !saveMu.isPending && isMatterFormValid(values);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !e.altKey) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "TEXTAREA") return;
      if (tag === "INPUT") {
        e.preventDefault();
        if (canSave) saveMu.mutate();
      }
    }
  };

  return (
    <BaseDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      size="fit"
      title={tr("matter.create.smartTitleWithCount", { values: { count: messages.length } })}
      className="w-[480px] max-w-full"
      contentClassName="px-4 py-[10px]"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-7 items-center rounded-full border border-brand/10 bg-bg-surface px-3 text-[13px] font-semibold text-text-strong transition-colors hover:bg-bg-hover"
          >
            {tr("matter.common.cancel")}
          </button>
          <button
            type="button"
            onClick={() => saveMu.mutate()}
            disabled={!canSave}
            className="inline-flex h-7 items-center rounded-full bg-brand px-3 text-[13px] font-semibold text-text-inverse transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saveMu.isPending ? tr("matter.action.saving") : tr("matter.action.save")}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4" onKeyDown={onKeyDown}>
        {isExtracting ? (
          <div className="flex flex-col items-center justify-center gap-4 py-[60px]">
            <span
              aria-label={tr("matter.create.aiLoadingAria")}
              className="inline-block h-8 w-8 animate-spin rounded-full border-[3px] border-border-default border-t-brand"
            />
            <div className="text-[14px] text-text-tertiary">
              {tr("matter.create.aiExtractingDesc")}
            </div>
          </div>
        ) : extractMu.error && !draftId ? (
          <div className="flex h-32 flex-col items-center justify-center gap-3">
            <span className="text-sm text-error">
              {extractMu.error instanceof Error
                ? extractMu.error.message
                : tr("matter.toast.aiExtractFailed")}
            </span>
            <Button onClick={() => extractMu.mutate()}>{tr("matter.create.retry")}</Button>
          </div>
        ) : draftId ? (
          <MatterFormBody
            values={values}
            onChange={(patch) => setValues((prev) => ({ ...prev, ...patch }))}
            channel={channel}
            autoFocus
          />
        ) : null}
      </div>
    </BaseDialog>
  );
}

function emptyValues(myUid: string): MatterFormValues {
  return {
    title: "",
    description: "",
    assigneeUids: myUid ? [myUid] : [],
    deadline: "",
  };
}

function useTriggerExtract(shouldRun: boolean, hasDraft: boolean, trigger: () => void): void {
  useEffect(() => {
    if (shouldRun && !hasDraft) trigger();
  }, [shouldRun, hasDraft, trigger]);
}

function useResetOnOpen(
  open: boolean,
  myUid: string,
  setDraftId: (v: string | null) => void,
  setValues: (v: MatterFormValues) => void,
): void {
  useEffect(() => {
    if (!open) return;
    setDraftId(null);
    setValues(emptyValues(myUid));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, myUid]);
}
