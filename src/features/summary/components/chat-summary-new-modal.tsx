import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Clock, X } from "lucide-react";
import { BaseDialog } from "@/features/base/components/overlay/base-dialog";
import { Button } from "@/components/semi-bridge/button";
import { message } from "@/components/ui/message";
import { useT } from "@/lib/i18n/use-t";
import { t } from "@/lib/i18n/instance";
import { createSchedule, createSummary } from "@/features/summary/api/summary.api";
import { ChatSelectorModal } from "@/features/summary/components/chat-selector-modal";
import { ScheduleConfigModal } from "@/features/summary/components/schedule-config-modal";
import { TemplateCard } from "@/features/summary/components/template-card";
import { useSummaryTopicTemplateInput } from "@/features/summary/hooks/use-summary-topic-template-input.hook";
import { channelToChatCandidate, getSourceType } from "@/features/summary/utils/channel-source";
import { notifyChatSummaryCreated } from "@/features/summary/utils/chat-summary-events";
import {
  describeScheduleConfig,
  scheduleToParams,
} from "@/features/summary/utils/summary-schedule";
import {
  SummaryMode,
  SourceType,
  type ChatCandidate,
  type ScheduleConfig,
  type SourceItem,
} from "@/features/summary/types/summary.types";

interface ChatSummaryNewModalProps {
  open: boolean;
  channel: { channelID: string; channelType: number };
  onClose: () => void;
  /** 创建成功后回调:聊天壳负责关闭弹窗并打开 / 刷新智能总结历史面板。 */
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
  const [selectedChats, setSelectedChats] = useState<ChatCandidate[]>([]);
  const [showChatSelector, setShowChatSelector] = useState(false);
  const [scheduleConfig, setScheduleConfig] = useState<ScheduleConfig | null>(null);
  const [showScheduleConfig, setShowScheduleConfig] = useState(false);
  const {
    inputRef,
    topic,
    resolvedTemplates,
    setTopic,
    resetTopic,
    handleTemplateClick,
    handleTopicFocus,
  } = useSummaryTopicTemplateInput({ enabled: open });

  useResetOnOpen(open, () => {
    resetTopic();
    setSelectedChats([channelToChatCandidate(channel)]);
    setShowChatSelector(false);
    setScheduleConfig(null);
    setShowScheduleConfig(false);
  });

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
      const result = await createSummary({
        topic: topic.trim(),
        origin_channel_id: channel.channelID,
        origin_channel_type: sourceType,
        sources,
      });
      if (scheduleConfig) {
        try {
          await createSchedule({
            title: topic.trim(),
            summary_mode: SummaryMode.BY_PERSON,
            ...scheduleToParams(scheduleConfig),
            time_range_type: 2,
            sources,
            scope: "task",
            task_id: result.task_id,
          });
        } catch (scheduleErr) {
          message.error(
            scheduleErr instanceof Error && scheduleErr.message
              ? scheduleErr.message
              : t("summary.create.scheduleFailed"),
          );
        }
      }
      return result;
    },
    onSuccess: ({ task_id }) => {
      notifyChatSummaryCreated({ channelId: channel.channelID, taskId: task_id });
      onCreated(task_id);
    },
    onError: (err) =>
      message.error(err instanceof Error ? err.message : t("summary.common.createFailedRetry")),
  });

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
            onChange={(e) => setTopic(e.target.value)}
            onFocus={handleTopicFocus}
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
            <button
              type="button"
              onClick={() => setShowScheduleConfig(true)}
              className={`flex max-w-full shrink-0 items-center gap-1 rounded-md px-2.5 py-1 text-xs transition-colors hover:bg-bg-hover ${
                scheduleConfig ? "text-brand" : "text-text-secondary"
              }`}
            >
              <Clock size={13} />
              <span className="truncate">
                {scheduleConfig
                  ? describeScheduleConfig(scheduleConfig, tr)
                  : tr("summary.schedule.config.title")}
              </span>
            </button>
            <span className="min-w-0 flex-1 truncate text-xs text-text-tertiary">
              {tr("summary.create.archivedNotice")}
            </span>
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
      <ScheduleConfigModal
        open={showScheduleConfig}
        value={scheduleConfig ?? { unit: "week", every: 1, time: "09:00" }}
        onConfirm={(config) => {
          setScheduleConfig(config);
          setShowScheduleConfig(false);
        }}
        onCancel={() => setShowScheduleConfig(false)}
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
