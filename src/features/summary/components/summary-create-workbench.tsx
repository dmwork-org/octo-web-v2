import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bot, Clock, Plus, X } from "lucide-react";
import { Button } from "@/components/semi-bridge/button";
import { toast } from "@/components/semi-bridge/toast";
import { t } from "@/lib/i18n/instance";
import { useT } from "@/lib/i18n/use-t";
import { createSchedule, createSummary } from "@/features/summary/api/summary.api";
import { ChatSelectorModal } from "@/features/summary/components/chat-selector-modal";
import { ScheduleConfigModal } from "@/features/summary/components/schedule-config-modal";
import { TemplateCard } from "@/features/summary/components/template-card";
import { useSummaryTopicTemplateInput } from "@/features/summary/hooks/use-summary-topic-template-input.hook";
import {
  describeScheduleConfig,
  scheduleToParams,
} from "@/features/summary/utils/summary-schedule";
import {
  SourceType,
  SummaryMode,
  type ChatCandidate,
  type CreateSummaryParams,
  type ScheduleConfig,
  type SourceItem,
} from "@/features/summary/types/summary.types";

interface SummaryCreateWorkbenchProps {
  onCreated: (taskId: number) => void;
}

function chatTypeToSourceType(chatType: ChatCandidate["chat_type"]): SourceItem["source_type"] {
  if (chatType === "group") return SourceType.GROUP_CHAT;
  if (chatType === "thread") return SourceType.THREAD;
  return SourceType.DIRECT_MESSAGE;
}

function chatsToSources(chats: ChatCandidate[]): SourceItem[] {
  return chats.map((chat) => ({
    source_type: chatTypeToSourceType(chat.chat_type),
    source_id: chat.chat_id,
    source_name: chat.name,
  }));
}

export function SummaryCreateWorkbench({ onCreated }: SummaryCreateWorkbenchProps) {
  const tr = useT();
  const qc = useQueryClient();
  const [selectedChats, setSelectedChats] = useState<ChatCandidate[]>([]);
  const [scheduleConfig, setScheduleConfig] = useState<ScheduleConfig | null>(null);
  const [showChatSelector, setShowChatSelector] = useState(false);
  const [showScheduleConfig, setShowScheduleConfig] = useState(false);
  const { inputRef, topic, resolvedTemplates, setTopic, handleTemplateClick, handleTopicFocus } =
    useSummaryTopicTemplateInput({ maxLength: 1000 });

  const mu = useMutation({
    mutationFn: async () => {
      const sources = chatsToSources(selectedChats);
      const params: CreateSummaryParams = {
        topic: topic.trim(),
        title: topic.trim(),
        summary_mode: SummaryMode.BY_PERSON,
      };
      if (sources.length > 0) params.sources = sources;
      const result = await createSummary(params);
      if (scheduleConfig) {
        try {
          await createSchedule({
            title: topic.trim(),
            summary_mode: params.summary_mode ?? SummaryMode.BY_PERSON,
            ...scheduleToParams(scheduleConfig),
            time_range_type: 2,
            sources,
            scope: "task",
            task_id: result.task_id,
          });
        } catch (err) {
          toast.error(err instanceof Error ? err.message : t("summary.create.scheduleFailed"));
        }
      }
      return result;
    },
    onSuccess: ({ task_id }) => {
      void qc.invalidateQueries({ queryKey: ["summary", "list"] });
      toast.success(t("summary.create.success"));
      onCreated(task_id);
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("summary.common.createFailed")),
  });

  const handleSubmit = () => {
    if (!topic.trim() || mu.isPending) return;
    mu.mutate();
  };

  const removeChat = (chatId: string) => {
    setSelectedChats((prev) => prev.filter((chat) => chat.chat_id !== chatId));
  };

  return (
    <section className="flex flex-1 flex-col overflow-y-auto bg-bg-base">
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-8 py-8">
        <header className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-bg-surface text-brand">
            <Bot size={24} />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-text-primary">
              {tr("summary.create.title")}
            </h1>
            <p className="mt-1 text-sm text-text-tertiary">{tr("summary.create.desc")}</p>
          </div>
        </header>

        <div className="overflow-hidden rounded-lg border border-border-default bg-bg-surface shadow-sm">
          <div>
            <textarea
              ref={inputRef}
              autoFocus
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              onFocus={handleTopicFocus}
              rows={3}
              maxLength={1000}
              placeholder={tr("summary.create.topicPlaceholder")}
              className="block min-h-24 w-full resize-none border-0 bg-bg-surface px-4 py-3 text-sm leading-6 text-text-primary outline-none placeholder:text-text-tertiary"
            />
            <div className="px-4 pb-2 text-right text-[11px] text-text-tertiary">
              {topic.length}/1000
            </div>
          </div>

          {topic.length >= 1000 ? (
            <div className="px-4 pb-2 text-xs text-warning">
              {tr("summary.common.charLimitReached", { values: { count: 1000 } })}
            </div>
          ) : null}

          {!topic.trim() ? (
            <div className="border-t border-border-subtle px-4 py-4">
              <div className="mb-3 text-xs font-medium text-text-secondary">
                {tr("summary.create.templatesTitle")}
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                {resolvedTemplates.map((template) => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    onClick={handleTemplateClick}
                  />
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle bg-bg-elevated px-4 py-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowChatSelector(true)}
                className={`flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm transition-colors hover:bg-bg-hover ${
                  selectedChats.length > 0 ? "text-brand" : "text-text-secondary"
                }`}
              >
                <Plus size={15} />
                {selectedChats.length > 0
                  ? tr("summary.create.selectedChats", {
                      values: { count: selectedChats.length },
                    })
                  : tr("summary.create.selectChat")}
              </button>
              <button
                type="button"
                onClick={() => setShowScheduleConfig(true)}
                className={`flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm transition-colors hover:bg-bg-hover ${
                  scheduleConfig ? "text-brand" : "text-text-secondary"
                }`}
              >
                <Clock size={15} />
                {scheduleConfig
                  ? describeScheduleConfig(scheduleConfig, t)
                  : tr("summary.schedule.config.title")}
              </button>

              <span className="text-xs text-text-tertiary">
                {tr("summary.create.archivedNotice")}
              </span>
            </div>

            <Button
              type="primary"
              theme="solid"
              loading={mu.isPending}
              disabled={!topic.trim() || mu.isPending}
              onClick={handleSubmit}
            >
              {mu.isPending ? tr("summary.create.submitting") : tr("summary.create.start")}
            </Button>
          </div>
        </div>

        {selectedChats.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {selectedChats.map((chat) => (
              <span
                key={chat.chat_id}
                className="flex max-w-60 items-center gap-1.5 rounded-md bg-brand-tint px-2.5 py-1 text-xs text-text-primary"
              >
                <span className="truncate">{chat.name}</span>
                <button
                  type="button"
                  onClick={() => removeChat(chat.chat_id)}
                  className="text-text-tertiary hover:text-text-primary"
                  aria-label={tr("summary.common.remove")}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        ) : null}
      </div>

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
    </section>
  );
}
