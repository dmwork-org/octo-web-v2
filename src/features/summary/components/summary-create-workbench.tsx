import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Plus, X } from "lucide-react";
import { Button } from "@/components/semi-bridge/button";
import { toast } from "@/components/semi-bridge/toast";
import { t } from "@/lib/i18n/instance";
import { useT } from "@/lib/i18n/use-t";
import { createSummary, getTopicTemplates } from "@/features/summary/api/summary.api";
import { ChatSelectorModal } from "@/features/summary/components/chat-selector-modal";
import { TemplateCard } from "@/features/summary/components/template-card";
import { TOPIC_TEMPLATES } from "@/features/summary/constants/topic-templates";
import {
  computeTemplateSelection,
  resolveTemplate,
  type ResolvableTemplate,
} from "@/features/summary/utils/template-resolver";
import {
  SourceType,
  SummaryMode,
  type ChatCandidate,
  type CreateSummaryParams,
  type SourceItem,
  type TopicTemplate,
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
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [topic, setTopic] = useState("");
  const [placeholderRange, setPlaceholderRange] = useState<[number, number] | null>(null);
  const [selectedChats, setSelectedChats] = useState<ChatCandidate[]>([]);
  const [showChatSelector, setShowChatSelector] = useState(false);

  const { data: remoteTemplates } = useQuery({
    queryKey: ["summary", "topic-templates"],
    queryFn: () => getTopicTemplates(),
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
      const sources = chatsToSources(selectedChats);
      const params: CreateSummaryParams = {
        topic: topic.trim(),
        title: topic.trim(),
        summary_mode: SummaryMode.BY_PERSON,
      };
      if (sources.length > 0) params.sources = sources;
      return createSummary(params);
    },
    onSuccess: ({ task_id }) => {
      void qc.invalidateQueries({ queryKey: ["summary", "list"] });
      toast.success(t("summary.create.success"));
      onCreated(task_id);
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("summary.common.createFailed")),
  });

  const handleTemplateClick = (template: TopicTemplate) => {
    const { text, range } = computeTemplateSelection(template);
    setTopic(text);
    setPlaceholderRange(range);
    setTimeout(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      if (range) input.setSelectionRange(range[0], range[1]);
    }, 0);
  };

  const handleTopicFocus = () => {
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
          <div className="relative">
            <textarea
              ref={inputRef}
              autoFocus
              value={topic}
              onChange={(event) => {
                setTopic(event.target.value.slice(0, 1000));
                setPlaceholderRange(null);
              }}
              onFocus={handleTopicFocus}
              rows={3}
              maxLength={1000}
              placeholder={tr("summary.create.topicPlaceholder")}
              className="block min-h-24 w-full resize-none border-0 bg-bg-surface px-4 py-3 pr-12 text-sm leading-6 text-text-primary outline-none placeholder:text-text-tertiary"
            />
            <span className="pointer-events-none absolute right-4 top-3 text-[11px] text-text-tertiary">
              {topic.length}/1000
            </span>
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
    </section>
  );
}
