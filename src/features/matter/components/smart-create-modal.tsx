import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import WKSDK, { Channel, ChannelTypePerson, type Message } from "wukongimjssdk";
import { X } from "lucide-react";
import { Button } from "@/components/semi-bridge/button";
import { toast } from "@/components/semi-bridge/toast";
import { authStore } from "@/features/base/stores/auth";
import { createMatter, extractMatter, updateMatter } from "@/features/matter/api/matter.api";
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
  /** composer 工具栏 ✓ / Alt+Enter 触发时可预填 title(对齐旧 prefillTitle)。 */
  prefillTitle?: string;
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
 * 智能创建事项 modal(对应旧 dmworktodo SmartCreateModal + CreateTaskModal):
 *
 * 两种触发路径:
 *
 * - **selection-toolbar "创建新事项"**(messages 非空):
 *   1. open 时调 extractMatter(后端 LLM 抽取并直接创建 matter 返回 id)
 *   2. 显示 loading → 显示 AI 抽取的 title / description,用户可编辑
 *   3. 保存 → updateMatter 落地
 *   4. 取消 → onClose(本期不删孤儿,旧版 onClose 删,P4+ 补)
 *
 * - **composer ✓ / Alt+Enter**(messages 空,对齐旧 CreateTaskModal):
 *   1. 跳过 extract,直接给用户空表单(可预填 prefillTitle)
 *   2. 保存 → createMatter 落地
 */
export function SmartCreateModal({
  open,
  channel,
  channelName,
  messages,
  prefillTitle,
  onClose,
}: SmartCreateModalProps) {
  const myUid = useStore(authStore, (s) => s.user?.uid ?? "");
  const [draft, setDraft] = useState<ExtractResult | null>(null);
  // 手动新建路径:本地维护 title/description,不走 extract
  const isManual = messages.length === 0;
  const [manualTitle, setManualTitle] = useState("");
  const [manualDesc, setManualDesc] = useState("");

  // open 时初始化 manual 预填(每次 open 重新填,关掉重开重置)
  useResetManualOnOpen(open, isManual, prefillTitle ?? "", setManualTitle, setManualDesc);

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

  // 仅 messages 非空时自动 trigger extract;空 messages 直接进 manual 编辑
  useTriggerExtract(open && !isManual, !!draft, extractMu.mutate);

  const saveMu = useMutation({
    mutationFn: async () => {
      if (isManual) {
        const t = manualTitle.trim();
        if (!t) {
          throw new Error("请输入事项标题");
        }
        await createMatter({
          title: t,
          description: manualDesc.trim() || undefined,
          source_channel_id: channel.channelID,
          source_channel_type: channel.channelType,
          source_name: channelName,
        });
        return;
      }
      if (!draft) return;
      await updateMatter(draft.id, {
        title: draft.title,
        description: draft.description ?? null,
        deadline: draft.deadline ? new Date(draft.deadline).toISOString() : null,
      });
    },
    onSuccess: () => {
      toast.success(isManual ? "事项已创建" : "已保存事项");
      setDraft(null);
      setManualTitle("");
      setManualDesc("");
      onClose();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "保存失败"),
  });

  if (!open) return null;

  const isExtracting = !isManual && extractMu.isPending && !draft;
  const headerTitle = isManual ? "新建事项" : `AI 智能创建事项 (${messages.length} 条消息)`;
  const saveDisabled = isManual
    ? !manualTitle.trim() || saveMu.isPending
    : !draft || saveMu.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-border-default bg-bg-surface shadow-xl">
        <header className="flex shrink-0 items-center justify-between border-b border-border-subtle px-5 py-3">
          <h2 className="text-sm font-semibold text-text-primary">{headerTitle}</h2>
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
          {isManual ? (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-text-tertiary">标题</span>
                <input
                  value={manualTitle}
                  onChange={(e) => setManualTitle(e.target.value)}
                  placeholder="给事项起个名字"
                  autoFocus
                  maxLength={200}
                  className="rounded-md border border-border-default bg-bg-base px-3 py-2 text-sm text-text-primary focus:border-brand focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-text-tertiary">主要目标(可选)</span>
                <textarea
                  value={manualDesc}
                  onChange={(e) => setManualDesc(e.target.value)}
                  rows={5}
                  placeholder="补充事项的上下文 / 验收标准 ..."
                  className="resize-none rounded-md border border-border-default bg-bg-base px-3 py-2 text-sm text-text-primary focus:border-brand focus:outline-none"
                />
              </label>
            </>
          ) : isExtracting ? (
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
            disabled={saveDisabled}
            loading={saveMu.isPending}
            onClick={() => saveMu.mutate()}
          >
            {isManual ? "创建" : "保存"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function useTriggerExtract(shouldRun: boolean, hasDraft: boolean, trigger: () => void): void {
  useEffect(() => {
    if (shouldRun && !hasDraft) trigger();
  }, [shouldRun, hasDraft, trigger]);
}

/** open 翻起 / 切换 prefill 时,重置 manual 表单字段(命名 hook 满足规则)。 */
function useResetManualOnOpen(
  open: boolean,
  isManual: boolean,
  prefill: string,
  setTitle: (v: string) => void,
  setDesc: (v: string) => void,
): void {
  useEffect(() => {
    if (!open || !isManual) return;
    setTitle(prefill.slice(0, 200));
    setDesc("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isManual, prefill]);
}
