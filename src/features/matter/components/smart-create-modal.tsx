import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import WKSDK, { Channel, ChannelTypePerson, type Message } from "wukongimjssdk";
import { X } from "lucide-react";
import { Button } from "@/components/semi-bridge/button";
import { toast } from "@/components/semi-bridge/toast";
import { authStore } from "@/features/base/stores/auth";
import { extractMatter, updateMatter } from "@/features/matter/api/matter.api";
import type {
  ExtractMatterReq,
  ExtractMessage,
  ExtractResult,
} from "@/features/matter/types/matter.types";

interface SmartCreateModalProps {
  open: boolean;
  channel: Channel;
  channelName?: string;
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
 * 智能创建事项 modal(对应旧 dmworktodo SmartCreateModal):
 *
 * 1. open 时立即调 extractMatter(后端 LLM 抽取并直接创建 matter 返回 id)
 * 2. 显示 loading → 显示 AI 抽取的 title / description,用户可编辑
 * 3. 保存 → updateMatter 落地
 * 4. 取消 → onClose(本期不删孤儿,旧版 onClose 删,P4+ 补)
 */
export function SmartCreateModal({
  open,
  channel,
  channelName,
  messages,
  onClose,
}: SmartCreateModalProps) {
  const myUid = useStore(authStore, (s) => s.user?.uid ?? "");
  const [draft, setDraft] = useState<ExtractResult | null>(null);

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
    onSuccess: (result) => setDraft(result),
    onError: (err) => toast.error(err instanceof Error ? err.message : "AI 抽取失败"),
  });

  useTriggerExtract(open, !!draft, extractMu.mutate);

  const saveMu = useMutation({
    mutationFn: async () => {
      if (!draft) return;
      await updateMatter(draft.id, {
        title: draft.title,
        description: draft.description ?? null,
        deadline: draft.deadline ? new Date(draft.deadline).toISOString() : null,
      });
    },
    onSuccess: () => {
      toast.success("已保存事项");
      setDraft(null);
      onClose();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "保存失败"),
  });

  if (!open) return null;

  const isExtracting = extractMu.isPending && !draft;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-border-default bg-bg-surface shadow-xl">
        <header className="flex shrink-0 items-center justify-between border-b border-border-subtle px-5 py-3">
          <h2 className="text-sm font-semibold text-text-primary">
            AI 智能创建事项 ({messages.length} 条消息)
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
          >
            <X size={16} />
          </button>
        </header>

        <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-5">
          {isExtracting ? (
            <div className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
              AI 正在抽取事项...
            </div>
          ) : extractMu.error ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3">
              <span className="text-sm text-error">
                {extractMu.error instanceof Error ? extractMu.error.message : "AI 抽取失败"}
              </span>
              <Button onClick={() => extractMu.mutate()}>重试</Button>
            </div>
          ) : draft ? (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-text-tertiary">标题</span>
                <input
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  className="rounded-md border border-border-default bg-bg-base px-3 py-2 text-sm text-text-primary focus:border-brand focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-text-tertiary">主要目标</span>
                <textarea
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  rows={5}
                  className="resize-none rounded-md border border-border-default bg-bg-base px-3 py-2 text-sm text-text-primary focus:border-brand focus:outline-none"
                />
              </label>
              <div className="text-[11px] text-text-tertiary">
                #{draft.seq_no} · 由 AI 从 {draft.source_msgs.length} 条消息抽取
              </div>
            </>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border-subtle px-5 py-3">
          <Button type="tertiary" theme="borderless" onClick={onClose}>
            取消
          </Button>
          <Button
            type="primary"
            theme="solid"
            disabled={!draft || saveMu.isPending}
            loading={saveMu.isPending}
            onClick={() => saveMu.mutate()}
          >
            保存
          </Button>
        </div>
      </div>
    </div>
  );
}

function useTriggerExtract(open: boolean, hasDraft: boolean, trigger: () => void): void {
  useEffect(() => {
    if (open && !hasDraft) trigger();
  }, [open, hasDraft, trigger]);
}
