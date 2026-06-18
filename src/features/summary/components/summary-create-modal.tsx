import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import { ChannelTypeGroup, ChannelTypePerson, type Conversation } from "wukongimjssdk";
import { X } from "lucide-react";
import { Button } from "@/components/semi-bridge/button";
import { toast } from "@/components/semi-bridge/toast";
import { useT } from "@/lib/i18n/use-t";
import { t } from "@/lib/i18n/instance";
import { spaceStore } from "@/features/base/stores/space";
import { conversationsQueryOptions } from "@/features/chat/queries/conversations.query";
import { createSummary } from "@/features/summary/api/summary.api";
import { ParticipantPicker } from "@/features/summary/components/participant-picker";
import { SummarySourcePicker } from "@/features/summary/components/summary-source-picker";
import { TemplateCard } from "@/features/summary/components/template-card";
import { useSummaryTopicTemplateInput } from "@/features/summary/hooks/use-summary-topic-template-input.hook";
import {
  SourceType,
  SummaryMode,
  type SourceItem,
  type SummaryModeType,
} from "@/features/summary/types/summary.types";

interface SummaryCreateModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (taskId: number) => void;
}

function convToSource(c: Conversation): SourceItem {
  const type =
    c.channel.channelType === ChannelTypeGroup
      ? SourceType.GROUP_CHAT
      : c.channel.channelType === ChannelTypePerson
        ? SourceType.DIRECT_MESSAGE
        : SourceType.THREAD;
  return {
    source_type: type,
    source_id: c.channel.channelID,
    source_name: c.channelInfo?.title ?? c.channel.channelID,
  };
}

/**
 * 创建总结(Wave 3c 加 mode 切换 + participants)。
 */
export function SummaryCreateModal({ open, onClose, onCreated }: SummaryCreateModalProps) {
  const tr = useT();
  const qc = useQueryClient();
  const spaceId = useStore(spaceStore, (s) => s.spaceId);
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<SummaryModeType>(SummaryMode.BY_GROUP);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [participantUids, setParticipantUids] = useState<string[]>([]);
  const {
    inputRef: topicRef,
    topic,
    resolvedTemplates,
    setTopic,
    resetTopic,
    handleTemplateClick,
    handleTopicFocus,
  } = useSummaryTopicTemplateInput({ enabled: open, maxLength: 1000 });

  const { data: conversations } = useQuery({
    ...conversationsQueryOptions(spaceId),
    enabled: open,
  });

  const candidates = useMemo(() => {
    return (conversations ?? []).filter(
      (c) =>
        c.channel.channelType === ChannelTypeGroup || c.channel.channelType === ChannelTypePerson,
    );
  }, [conversations]);

  const mu = useMutation({
    mutationFn: () => {
      const sources = candidates
        .filter((c) => selectedIds.has(c.channel.channelID))
        .map(convToSource);
      return createSummary({
        topic: topic.trim(),
        title: title.trim() || topic.trim(),
        summary_mode: mode,
        sources: sources.length > 0 ? sources : undefined,
        participants:
          mode === SummaryMode.BY_PERSON && participantUids.length > 0
            ? participantUids.map((uid) => ({ user_id: uid }))
            : undefined,
        confirm_timeout_hours: mode === SummaryMode.BY_PERSON ? 24 : undefined,
      });
    },
    onSuccess: ({ task_id }) => {
      void qc.invalidateQueries({ queryKey: ["summary", "list"] });
      toast.success(
        mode === SummaryMode.BY_PERSON
          ? t("summary.create.successPerson")
          : t("summary.create.successGroup"),
      );
      setTitle("");
      resetTopic();
      setSelectedIds(new Set());
      setParticipantUids([]);
      setMode(SummaryMode.BY_GROUP);
      onCreated(task_id);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t("summary.create.failed")),
  });

  if (!open) return null;

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!topic.trim() || mu.isPending) return;
    if (mode === SummaryMode.BY_PERSON && participantUids.length === 0) {
      toast.error(t("summary.create.personOnRequest"));
      return;
    }
    mu.mutate();
  };

  const toggleSource = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isPerson = mode === SummaryMode.BY_PERSON;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-border-default bg-bg-surface shadow-xl">
        <header className="flex shrink-0 items-center justify-between border-b border-border-subtle px-5 py-3">
          <h2 className="text-sm font-semibold text-text-primary">
            {tr("summary.create.modalTitle")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={tr("summary.create.closeAria")}
            className="flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
          >
            <X size={16} />
          </button>
        </header>

        <form onSubmit={onSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex flex-col gap-3 overflow-y-auto px-5 py-4">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-text-secondary">
                {tr("summary.create.modeLabel")}
              </span>
              <div className="flex gap-1 rounded-md bg-bg-elevated p-1">
                {(
                  [
                    { v: SummaryMode.BY_GROUP, labelKey: "summary.create.modeByGroup" },
                    { v: SummaryMode.BY_PERSON, labelKey: "summary.create.modeByPerson" },
                  ] as const
                ).map((o) => (
                  <button
                    key={o.v}
                    type="button"
                    onClick={() => setMode(o.v)}
                    className={`flex-1 rounded-sm px-3 py-1.5 text-sm transition-colors ${
                      mode === o.v
                        ? "bg-bg-surface font-semibold text-text-primary shadow-sm"
                        : "text-text-secondary hover:text-text-primary"
                    }`}
                  >
                    {tr(o.labelKey)}
                  </button>
                ))}
              </div>
              {isPerson ? (
                <p className="text-[11px] text-text-tertiary">
                  {tr("summary.create.modeByPersonHint")}
                </p>
              ) : (
                <p className="text-[11px] text-text-tertiary">
                  {tr("summary.create.modeByGroupHint")}
                </p>
              )}
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-text-secondary">
                {tr("summary.create.topicLabel")}
              </span>
              <textarea
                ref={topicRef}
                autoFocus
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                onFocus={handleTopicFocus}
                rows={3}
                placeholder={tr("summary.create.topicPlaceholder")}
                className="resize-none rounded-md border border-border-default bg-bg-base px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-brand focus:outline-none"
              />
              <span className="self-end text-[10px] text-text-tertiary">{topic.length}/1000</span>
            </label>

            {!topic.trim() ? (
              <div className="flex flex-col gap-2">
                <span className="text-xs font-medium text-text-secondary">
                  {tr("summary.create.templatesTitle")}
                </span>
                <div className="grid grid-cols-2 gap-2">
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

            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-text-secondary">
                {tr("summary.create.titleLabel")}
              </span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={tr("summary.create.titleOptional")}
                className="rounded-md border border-border-default bg-bg-base px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-brand focus:outline-none"
              />
            </label>

            {isPerson ? (
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-text-secondary">
                  {tr("summary.create.participantsLabel", {
                    values: { count: participantUids.length },
                  })}
                </span>
                <ParticipantPicker value={participantUids} onChange={setParticipantUids} />
              </div>
            ) : null}

            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-text-secondary">
                {tr("summary.create.sourcesLabel", {
                  values: {
                    personSuffix: isPerson ? tr("summary.create.sourcesPersonSuffix") : "",
                    count: selectedIds.size,
                  },
                })}
              </span>
              <SummarySourcePicker
                candidates={candidates}
                selectedIds={selectedIds}
                onToggle={toggleSource}
                emptyLabel={tr("summary.create.noChats")}
                tagGroupLabel={tr("summary.create.tagGroup")}
                tagDirectLabel={tr("summary.create.tagDirect")}
                className="max-h-64"
              />
            </div>
          </div>

          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border-subtle px-5 py-3">
            <Button type="tertiary" theme="borderless" onClick={onClose}>
              {tr("summary.common.cancel")}
            </Button>
            <Button
              htmlType="submit"
              type="primary"
              theme="solid"
              loading={mu.isPending}
              disabled={!topic.trim() || (isPerson && participantUids.length === 0)}
            >
              {tr("summary.create.create")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
