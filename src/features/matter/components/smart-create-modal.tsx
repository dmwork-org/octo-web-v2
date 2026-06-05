import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import WKSDK, { Channel, ChannelTypePerson, type Message } from "wukongimjssdk";
import { Button } from "@/components/semi-bridge/button";
import { toast } from "@/components/semi-bridge/toast";
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
 *
 * 触发:**selection-toolbar 多选消息 → "创建新事项"** 唯一入口
 * (chat ✓ / Alt+Enter 走 CreateMatterModal,messages 空时不在本组件)。
 *
 * 流程:
 *   1. open 即调 extractMatter(LLM 抽取并落 matter 拿 id;后端自动把 creator_uid 加 assignee)
 *   2. extract 返 title/description prefill 进 MatterFormBody
 *   3. 用户补齐 assignee(默认 prefill 自己)+ deadline
 *   4. 保存:updateMatter(id) + assignees reconcile(diff toAdd/toRemove,避免 409)
 */
export function SmartCreateModal({
  open,
  channel,
  channelName,
  messages,
  onClose,
}: SmartCreateModalProps) {
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
    onError: (err) => toast.error(err instanceof Error ? err.message : "AI 抽取失败"),
  });
  useTriggerExtract(open, !!draftId, extractMu.mutate);

  const saveMu = useMutation({
    mutationFn: async () => {
      if (!draftId) throw new Error("缺少 matter id");
      await updateMatter(draftId, {
        title: values.title.trim(),
        description: values.description.trim(),
        deadline: buildDeadlineISO(values.deadline),
      });
      // assignees reconcile:extract 创建 matter 时后端已把 creator_uid 自动加 assignee,
      // 直接 add 会 409 Conflict。先 getMatter 拿当前 assignees,diff 出 toAdd/toRemove
      // (对齐老仓 dmworktodo/module.tsx L791-807)。
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
      toast.success("事项已创建");
      onClose();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "保存失败"),
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
      title={`AI 智能创建事项 (${messages.length} 条消息)`}
      className="w-[480px] max-w-full"
      contentClassName="px-4 py-[10px]"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-7 items-center rounded-full border border-brand/10 bg-bg-surface px-3 text-[13px] font-semibold text-text-strong transition-colors hover:bg-bg-hover"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => saveMu.mutate()}
            disabled={!canSave}
            className="inline-flex h-7 items-center rounded-full bg-brand px-3 text-[13px] font-semibold text-text-inverse transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saveMu.isPending ? "保存中..." : "保存"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4" onKeyDown={onKeyDown}>
        {isExtracting ? (
          // 对齐老仓 SmartCreateModal L205-219:60px 上下 padding + spinner + 14px 提示文案
          <div className="flex flex-col items-center justify-center gap-4 py-[60px]">
            <span
              aria-label="加载中"
              className="inline-block h-8 w-8 animate-spin rounded-full border-[3px] border-border-default border-t-brand"
            />
            <div className="text-[14px] text-text-tertiary">AI 正在努力提取事项信息...</div>
          </div>
        ) : extractMu.error && !draftId ? (
          <div className="flex h-32 flex-col items-center justify-center gap-3">
            <span className="text-sm text-error">
              {extractMu.error instanceof Error ? extractMu.error.message : "AI 抽取失败"}
            </span>
            <Button onClick={() => extractMu.mutate()}>重试</Button>
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
