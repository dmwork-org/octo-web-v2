import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { BaseDialog } from "@/features/base/components/overlay/base-dialog";
import { Button } from "@/components/semi-bridge/button";
import { toast } from "@/components/semi-bridge/toast";
import { useT } from "@/lib/i18n/use-t";
import { t } from "@/lib/i18n/instance";
import { createSummary, getTopicTemplates } from "@/features/summary/api/summary.api";
import { ChatSelectorModal } from "@/features/summary/components/chat-selector-modal";
import { TemplateCard } from "@/features/summary/components/template-card";
import { TOPIC_TEMPLATES } from "@/features/summary/constants/topic-templates";
import { channelToChatCandidate, getSourceType } from "@/features/summary/utils/channel-source";
import { notifyChatSummaryCreated } from "@/features/summary/utils/chat-summary-events";
import {
  computeTemplateSelection,
  resolveTemplate,
  type ResolvableTemplate,
} from "@/features/summary/utils/template-resolver";
import {
  SourceType,
  type ChatCandidate,
  type SourceItem,
  type TopicTemplate,
} from "@/features/summary/types/summary.types";

interface ChatSummaryNewModalProps {
  open: boolean;
  channel: { channelID: string; channelType: number };
  onClose: () => void;
  /** 创建成功后回调:本仓 chat-summary-panel 用来 selectSummary(taskId) 跳详情。 */
  onCreated: (taskId: number) => void;
}

function chatTypeToSourceType(t: ChatCandidate["chat_type"]): SourceItem["source_type"] {
  if (t === "group") return SourceType.GROUP_CHAT;
  if (t === "thread") return SourceType.THREAD;
  return SourceType.DIRECT_MESSAGE;
}

/**
 * Chat 上下文内"新建总结" modal(对齐老仓 ChatSummaryNewModal,本期不动主模块
 * SummaryCreateModal,等后续再统一)。
 *
 * 设计要点:
 * - 默认 selectedChats = [当前 channel 转 ChatCandidate],用户可继续加多 chat。
 * - 输入框为空时显示一组建议主题(后端 /summary-templates 拉,空时 fallback
 *   到前端 TOPIC_TEMPLATES)。
 * - parameterized 模板点选会把 placeholder label 填进输入框 + 自动选中 token,
 *   下次 focus 时清空该 placeholder。
 * - 提交时带 origin_channel_id + origin_channel_type(WK channelType → SourceType
 *   枚举,防止 thread 直接传 5 被后端拒)。
 * - 成功后 dispatch chat-summary-created event,chat panel / star button 自动刷新。
 */
export function ChatSummaryNewModal({
  open,
  channel,
  onClose,
  onCreated,
}: ChatSummaryNewModalProps) {
  const tr = useT();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [topic, setTopic] = useState("");
  const [selectedChats, setSelectedChats] = useState<ChatCandidate[]>([]);
  const [showChatSelector, setShowChatSelector] = useState(false);
  const [placeholderRange, setPlaceholderRange] = useState<[number, number] | null>(null);

  useResetOnOpen(open, () => {
    setTopic("");
    setSelectedChats([channelToChatCandidate(channel)]);
    setShowChatSelector(false);
    setPlaceholderRange(null);
  });

  /** 后端模板,失败 / 空时 fallback 前端 TOPIC_TEMPLATES(对齐老仓 loadTemplates 兜底)。 */
  const { data: remoteTemplates } = useQuery({
    queryKey: ["summary", "topic-templates"],
    queryFn: () => getTopicTemplates(),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  const templates: ResolvableTemplate[] =
    remoteTemplates && remoteTemplates.length > 0 ? remoteTemplates : TOPIC_TEMPLATES;

  const resolvedTemplates = useMemo(
    () => templates.map((tpl) => resolveTemplate(tpl, t)),
    [templates],
  );

  const mu = useMutation({
    mutationFn: async () => {
      const sourceType = getSourceType(channel);
      if (sourceType === null) {
        throw new Error("unsupported channel type");
      }
      const sources: SourceItem[] =
        selectedChats.length > 0
          ? selectedChats.map((c) => ({
              source_type: chatTypeToSourceType(c.chat_type),
              source_id: c.chat_id,
              source_name: c.name,
            }))
          : [{ source_type: sourceType, source_id: channel.channelID }];
      return createSummary({
        topic: topic.trim(),
        origin_channel_id: channel.channelID,
        origin_channel_type: sourceType,
        sources,
      });
    },
    onSuccess: ({ task_id }) => {
      notifyChatSummaryCreated({ channelId: channel.channelID, taskId: task_id });
      onCreated(task_id);
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("summary.common.createFailedRetry")),
  });

  const handleTemplateClick = (tpl: TopicTemplate) => {
    const { text, range } = computeTemplateSelection(tpl);
    setTopic(text);
    setPlaceholderRange(range);
    // 下一个 tick 把光标定位到 placeholder token,让用户直接输入覆盖
    setTimeout(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      if (range) input.setSelectionRange(range[0], range[1]);
    }, 0);
  };

  // 输入框 focus 时,如果还停留在自动填入的 placeholder 选区上,清掉 placeholder 文本
  const handleInputFocus = () => {
    if (!placeholderRange) return;
    const [start, end] = placeholderRange;
    setTopic((prev) => prev.substring(0, start) + prev.substring(end));
    setPlaceholderRange(null);
    setTimeout(() => inputRef.current?.setSelectionRange(start, start), 0);
  };

  const handleSubmit = () => {
    if (!topic.trim() || mu.isPending) return;
    mu.mutate();
  };

  const removeChat = (chatId: string) => {
    setSelectedChats((prev) => prev.filter((c) => c.chat_id !== chatId));
  };

  const footer = (
    <Button
      type="primary"
      theme="solid"
      loading={mu.isPending}
      disabled={!topic.trim() || mu.isPending}
      onClick={handleSubmit}
    >
      {mu.isPending ? tr("summary.create.submitting") : tr("summary.create.start")}
    </Button>
  );

  return (
    <>
      <BaseDialog
        open={open}
        onOpenChange={(o) => {
          if (!o) onClose();
        }}
        size="lg"
        title={
          <span className="flex items-center gap-2">
            <span>{tr("summary.create.title")}</span>
            <span className="rounded-sm bg-brand px-1.5 py-0.5 text-[10px] font-semibold text-white">
              AI+
            </span>
          </span>
        }
        footer={footer}
      >
        <div className="flex flex-col gap-4 px-5 py-4">
          <p className="text-xs text-text-tertiary">{tr("summary.create.desc")}</p>

          <textarea
            ref={inputRef}
            value={topic}
            onChange={(e) => {
              setTopic(e.target.value);
              setPlaceholderRange(null);
            }}
            onFocus={handleInputFocus}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !mu.isPending) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            rows={3}
            placeholder={tr("summary.create.topicPlaceholderInChat")}
            className="resize-none rounded-md border border-border-default bg-bg-base px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-brand focus:outline-none"
          />

          {!topic.trim() ? (
            <div className="flex flex-col gap-2">
              <div className="text-xs font-medium text-text-secondary">
                {tr("summary.create.templatesTitle")}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {resolvedTemplates.map((tpl) => (
                  <TemplateCard key={tpl.id} template={tpl} onClick={handleTemplateClick} />
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle pt-3">
            <button
              type="button"
              onClick={() => setShowChatSelector(true)}
              className={`shrink-0 rounded-md border border-dashed px-2.5 py-1 text-xs transition-colors hover:bg-bg-hover ${
                selectedChats.length > 0
                  ? "border-brand text-brand"
                  : "border-border-default text-text-secondary"
              }`}
            >
              {selectedChats.length > 0
                ? tr("summary.create.selectedChats", {
                    values: { count: selectedChats.length },
                  })
                : `+ ${tr("summary.create.selectChat")}`}
            </button>
            {selectedChats.map((c) => (
              <span
                key={c.chat_id}
                className="flex shrink-0 items-center gap-1 rounded-md bg-brand-tint px-2 py-1 text-xs text-text-primary"
              >
                <span className="max-w-32 truncate">{c.name}</span>
                <button
                  type="button"
                  onClick={() => removeChat(c.chat_id)}
                  className="text-text-tertiary hover:text-text-primary"
                  aria-label={tr("summary.common.remove")}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        </div>
      </BaseDialog>

      <ChatSelectorModal
        open={showChatSelector}
        selected={selectedChats}
        onConfirm={(chats) => {
          setSelectedChats(chats);
          setShowChatSelector(false);
        }}
        onCancel={() => setShowChatSelector(false)}
      />
    </>
  );
}

function useResetOnOpen(open: boolean, reset: () => void): void {
  useEffect(() => {
    if (open) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}
