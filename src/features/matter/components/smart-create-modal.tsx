import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import WKSDK, { Channel, ChannelTypePerson, type Message } from "wukongimjssdk";
import { X } from "lucide-react";
import { Button } from "@/components/semi-bridge/button";
import { toast } from "@/components/semi-bridge/toast";
import { authStore } from "@/features/base/stores/auth";
import { addAssignee, extractMatter, updateMatter } from "@/features/matter/api/matter.api";
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
 * 触发:**selection-toolbar 多选消息 → "创建新事项"** 唯一入口
 * (chat ✓ / Alt+Enter 走 CreateMatterModal,messages 空时不在本组件)。
 *
 * 流程:
 *   1. open 即调 extractMatter(LLM 抽取并落 matter 拿 id)
 *   2. extract 返 title/description prefill 进 MatterFormBody(共享 4 字段表单)
 *   3. 用户补齐 assignee(默认 prefill 自己)+ deadline
 *   4. 保存:updateMatter(id) {title/description/deadline} + addAssignee batch
 *      (extract 创建出来的 matter 没有 assignee,需 batch 加)
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
      // extract 出来的 matter 默认无 assignee;批量 add
      if (values.assigneeUids.length > 0) {
        await Promise.all(values.assigneeUids.map((uid) => addAssignee(draftId, uid)));
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: mattersListInfiniteQueryKey(spaceId, undefined) });
      void qc.invalidateQueries({ queryKey: ["matter", "list"] });
      toast.success("事项已创建");
      onClose();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "保存失败"),
  });

  if (!open) return null;

  const isExtracting = extractMu.isPending && !draftId;
  const canSave = !!draftId && !saveMu.isPending && isMatterFormValid(values);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
      return;
    }
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onKeyDown={onKeyDown}
    >
      <div className="flex w-[480px] max-w-full flex-col rounded-lg bg-bg-surface shadow-xl ring-1 ring-brand/10">
        <header className="flex items-center justify-between p-4">
          <h3 className="m-0 text-base font-semibold text-text-strong">
            AI 智能创建事项 ({messages.length} 条消息)
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="flex h-6 w-6 items-center justify-center rounded-sm text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-primary"
          >
            <X size={16} />
          </button>
        </header>

        <div className="flex flex-col gap-4 px-4 py-[10px]">
          {isExtracting ? (
            <div className="flex h-32 items-center justify-center text-sm text-text-tertiary">
              AI 正在抽取事项...
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

        <div className="flex items-center justify-end gap-3 p-4">
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
        </div>
      </div>
    </div>
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
    // setters 稳定,跟 open + myUid 即可
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, myUid]);
}
