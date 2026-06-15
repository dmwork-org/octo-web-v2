import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Message, MessageText } from "wukongimjssdk";
import {
  Loader2,
  MessageSquareText,
  RefreshCcw,
  Send,
  Trash2,
  UsersRound,
  X as XIcon,
} from "lucide-react";
import { Button } from "@/components/semi-bridge/button";
import { toast } from "@/components/semi-bridge/toast";
import { BaseDialog } from "@/features/base/components/overlay/base-dialog";
import { ConfirmDialog } from "@/features/base/components/overlay/confirm-dialog";
import { useT } from "@/lib/i18n/use-t";
import { t } from "@/lib/i18n/instance";
import { ForwardModal } from "@/features/chat/components/forward-modal";
import { addMatterComment } from "@/features/matter/api/matter.api";
import {
  cancelSummary,
  deleteSummary,
  regenerateSummary,
} from "@/features/summary/api/summary.api";
import {
  personalResultQueryOptions,
  summaryDetailQueryKey,
  summaryDetailQueryOptions,
} from "@/features/summary/queries/summaries.query";
import { SummaryContent } from "@/features/summary/components/summary-content";
import { CitationText } from "@/features/summary/components/citation-text";
import { MatterPickerModal } from "@/features/summary/components/matter-picker-modal";
import { PersonalSection } from "@/features/summary/components/personal-section";
import {
  SourceType,
  SummaryMode,
  TaskStatus,
  type SourceItem,
  type TaskStatusType,
} from "@/features/summary/types/summary.types";
import { splitSummaryText } from "@/features/summary/utils/split-message";

interface SummaryDetailProps {
  taskId: number | null;
  onDeleted: () => void;
}

function cleanForwardContent(content: string): string {
  return content
    .replace(/\[\d+\]/g, "")
    .replace(/  +/g, " ")
    .trim();
}

function buildForwardMessages(content: string): Message[] {
  return splitSummaryText(cleanForwardContent(content)).map((chunk) => {
    const message = new Message();
    message.content = new MessageText(chunk);
    return message;
  });
}

function SkeletonBlock({ className }: { className: string }) {
  return <span className={`block animate-pulse rounded-sm bg-bg-elevated ${className}`} />;
}

function SummaryDetailSkeleton({ label }: { label: string }) {
  return (
    <section aria-label={label} className="flex flex-1 flex-col overflow-hidden bg-bg-surface">
      <header className="flex min-h-14 shrink-0 items-center justify-between gap-4 border-b border-border-subtle px-6 py-3">
        <div className="min-w-0 flex-1">
          <SkeletonBlock className="h-5 w-2/5" />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <SkeletonBlock className="h-7 w-24" />
          <SkeletonBlock className="h-7 w-24" />
          <SkeletonBlock className="h-7 w-7" />
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <article className="mx-auto flex w-full max-w-[920px] flex-col gap-5 px-8 py-6">
          <div>
            <div className="flex flex-col gap-3">
              <SkeletonBlock className="h-6 w-3/5" />
              <SkeletonBlock className="h-4 w-full" />
              <SkeletonBlock className="h-4 w-11/12" />
              <SkeletonBlock className="h-4 w-4/5" />
              <SkeletonBlock className="mt-2 h-5 w-2/5" />
              <SkeletonBlock className="h-4 w-full" />
              <SkeletonBlock className="h-4 w-10/12" />
              <SkeletonBlock className="h-4 w-7/12" />
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}

function SummaryProcessingPanel({ status }: { status: TaskStatusType }) {
  const tr = useT();
  const isWaitingConfirm = status === TaskStatus.WAITING_CONFIRM;
  const title = isWaitingConfirm
    ? tr("summary.detail.waitingConfirmTitle")
    : tr("summary.detail.processingTitle");
  const description = isWaitingConfirm
    ? tr("summary.detail.waitingConfirmDesc")
    : tr("summary.detail.processingDesc");

  return (
    <section
      aria-live="polite"
      className="flex min-h-[236px] flex-col items-center justify-center rounded-md border border-border-subtle bg-bg-base px-6 py-12 text-center"
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-full border border-border-default bg-bg-surface shadow-sm">
        <Loader2 size={28} className="animate-spin text-text-primary" />
      </div>
      <p className="mt-3 text-base leading-6 font-semibold text-text-primary">{title}</p>
      <p className="mt-1 max-w-md text-sm leading-6 text-text-tertiary">{description}</p>
    </section>
  );
}

function SummarySourcesPanel({ sources }: { sources: SourceItem[] }) {
  const tr = useT();
  const sourceIcon = (sourceType: SourceItem["source_type"]) => {
    if (sourceType === SourceType.GROUP_CHAT) return <UsersRound size={14} />;
    return <MessageSquareText size={14} />;
  };

  return (
    <section className="shrink-0 overflow-hidden rounded-md border border-border-subtle bg-bg-surface">
      <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-3">
        <MessageSquareText size={15} className="shrink-0 text-text-tertiary" />
        <h3 className="text-sm font-semibold text-text-primary">
          {tr("summary.detail.selectedSourcesTitle")}
        </h3>
      </div>
      {sources.length > 0 ? (
        <div className="flex max-h-40 flex-col divide-y divide-border-subtle overflow-y-auto bg-bg-base">
          {sources.map((source) => (
            <div
              key={`${source.source_type}-${source.source_id}`}
              className="flex min-h-10 items-center gap-2 px-4 py-2"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm border border-border-default bg-bg-surface text-text-tertiary">
                {sourceIcon(source.source_type)}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                {source.source_name || source.source_id}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="px-4 py-5 text-center text-sm text-text-tertiary">
          {tr("summary.detail.emptyContent")}
        </div>
      )}
    </section>
  );
}

/**
 * 总结详情面板。
 */
export function SummaryDetail({ taskId, onDeleted }: SummaryDetailProps) {
  const tr = useT();
  const qc = useQueryClient();
  const [forwardMessages, setForwardMessages] = useState<Message[] | null>(null);
  const [matterPickerOpen, setMatterPickerOpen] = useState(false);
  const [regenerateOpen, setRegenerateOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [regenerateTopic, setRegenerateTopic] = useState("");
  const { data, isLoading, isFetching, error } = useQuery(summaryDetailQueryOptions(taskId));
  const { data: personalResult } = useQuery(
    personalResultQueryOptions(taskId, data?.summary_mode === SummaryMode.BY_PERSON),
  );

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["summary", "list"] });
    if (taskId !== null) {
      void qc.invalidateQueries({ queryKey: summaryDetailQueryKey(taskId) });
    }
  };

  const regenMu = useMutation({
    mutationFn: (topic: string) => regenerateSummary(taskId!, { topic }),
    onSuccess: () => {
      setRegenerateOpen(false);
      invalidate();
      toast.success(t("summary.detail.regenerateStarted"));
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("summary.detail.regenerateFailed")),
  });

  const cancelMu = useMutation({
    mutationFn: () => cancelSummary(taskId!),
    onSuccess: () => {
      invalidate();
      toast.success(t("summary.detail.cancelledToast"));
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("summary.detail.cancelFailed")),
  });

  const deleteMu = useMutation({
    mutationFn: () => deleteSummary(taskId!),
    onSuccess: () => {
      setDeleteConfirmOpen(false);
      void qc.invalidateQueries({ queryKey: ["summary", "list"] });
      toast.success(t("summary.detail.deletedToast"));
      onDeleted();
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("summary.detail.deleteFailed")),
  });

  const forwardMatterMu = useMutation({
    mutationFn: ({
      matterId,
      content,
    }: {
      matterId: string;
      matterTitle: string;
      content: string;
    }) => addMatterComment(matterId, content),
    onSuccess: (_void, vars) => {
      setMatterPickerOpen(false);
      toast.success(t("summary.detail.forwardedToMatter", { values: { title: vars.matterTitle } }));
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("summary.detail.forwardFailed")),
  });

  if (taskId === null) {
    return (
      <section className="flex flex-1 flex-col items-center justify-center text-sm text-text-tertiary">
        {tr("summary.detail.empty")}
      </section>
    );
  }
  if (isLoading || (isFetching && data?.task_id !== taskId)) {
    return <SummaryDetailSkeleton label={tr("summary.detail.loading")} />;
  }
  if (error || !data) {
    return (
      <section className="flex flex-1 flex-col items-center justify-center text-sm text-error">
        {tr("summary.detail.loadFailed")}
      </section>
    );
  }

  const isFailed = data.status === TaskStatus.FAILED;
  const isCompleted = data.status === TaskStatus.COMPLETED;
  const isProcessing =
    data.status === TaskStatus.PROCESSING ||
    data.status === TaskStatus.PENDING ||
    data.status === TaskStatus.WAITING_CONFIRM;
  const isGenerating = data.status === TaskStatus.PROCESSING || data.status === TaskStatus.PENDING;
  const canRegen = isCompleted || isFailed;
  const canCancel = isProcessing;
  const citations = data.result?.citations;
  const hasCitations = !!citations && citations.length > 0;
  const isPersonalMode = data.summary_mode === SummaryMode.BY_PERSON;
  const resultContent = data.result?.content ?? "";
  const personalReady = isPersonalMode && !!personalResult?.content?.trim();

  const openForwardToChat = () => {
    if (!resultContent.trim()) {
      toast.warning(t("summary.detail.noForwardContent"));
      return;
    }
    const messages = buildForwardMessages(resultContent);
    if (messages.length === 0) {
      toast.warning(t("summary.detail.noForwardContent"));
      return;
    }
    setForwardMessages(messages);
  };

  const openForwardToMatter = () => {
    if (!resultContent.trim()) {
      toast.warning(t("summary.detail.noForwardContent"));
      return;
    }
    setMatterPickerOpen(true);
  };

  const openRegenerate = () => {
    setRegenerateTopic(data.title || "");
    setRegenerateOpen(true);
  };

  const submitRegenerate = () => {
    const topic = regenerateTopic.trim();
    if (!topic || regenMu.isPending) return;
    regenMu.mutate(topic);
  };

  return (
    <>
      <section className="flex flex-1 flex-col overflow-hidden bg-bg-surface">
        <header className="flex min-h-14 shrink-0 items-center justify-between gap-4 border-b border-border-subtle px-6 py-3">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[17px] leading-6 font-semibold text-text-primary">
              {data.title}
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {isCompleted ? (
              <>
                <Button type="tertiary" theme="borderless" size="small" onClick={openForwardToChat}>
                  <Send size={13} />
                  {tr("summary.detail.forwardToChat")}
                </Button>
                <Button
                  type="tertiary"
                  theme="borderless"
                  size="small"
                  loading={forwardMatterMu.isPending}
                  onClick={openForwardToMatter}
                >
                  <Send size={13} />
                  {tr("summary.detail.forwardToMatter")}
                </Button>
              </>
            ) : null}
            {canRegen ? (
              <Button
                type="tertiary"
                theme="borderless"
                size="small"
                loading={regenMu.isPending}
                onClick={openRegenerate}
              >
                <RefreshCcw size={13} />
                {tr("summary.detail.regenerate")}
              </Button>
            ) : null}
            {canCancel ? (
              <Button
                type="tertiary"
                theme="borderless"
                size="small"
                loading={cancelMu.isPending}
                onClick={() => cancelMu.mutate()}
              >
                <XIcon size={13} />
                {tr("summary.detail.cancelTask")}
              </Button>
            ) : null}
            <Button
              type="danger"
              theme="borderless"
              size="small"
              iconOnly
              aria-label={tr("summary.common.delete")}
              loading={deleteMu.isPending}
              onClick={() => setDeleteConfirmOpen(true)}
            >
              <Trash2 size={14} />
            </Button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <article className="mx-auto flex w-full max-w-[920px] flex-col gap-5 px-8 py-6">
              {isGenerating && !personalReady ? (
                <SummaryProcessingPanel status={data.status} />
              ) : (
                <>
                  {isPersonalMode ? <PersonalSection detail={data} /> : null}

                  {!isPersonalMode ? (
                    <div className="min-w-0 rounded-md border border-border-subtle bg-bg-surface p-4">
                      {isProcessing ? (
                        <SummaryProcessingPanel status={data.status} />
                      ) : isFailed ? (
                        <p className="text-sm text-error">
                          {data.error_message ?? tr("summary.detail.failedFallback")}
                        </p>
                      ) : data.result ? (
                        hasCitations ? (
                          <CitationText content={data.result.content} citations={citations!} />
                        ) : (
                          <SummaryContent content={data.result.content} />
                        )
                      ) : !isPersonalMode ? (
                        <p className="text-sm italic text-text-tertiary">
                          {tr("summary.detail.emptyContent")}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </>
              )}
            </article>
          </div>

          <div className="shrink-0 border-t border-border-subtle bg-bg-surface px-8 py-3">
            <div className="mx-auto w-full max-w-[920px]">
              <SummarySourcesPanel sources={data.sources} />
            </div>
          </div>
        </div>
      </section>
      <ForwardModal
        open={!!forwardMessages}
        messages={forwardMessages ?? []}
        defaultMode="per"
        onClose={() => setForwardMessages(null)}
      />
      <MatterPickerModal
        open={matterPickerOpen}
        onClose={() => setMatterPickerOpen(false)}
        onSelect={(matterId, matterTitle) => {
          forwardMatterMu.mutate({
            matterId,
            matterTitle,
            content: resultContent,
          });
        }}
      />
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title={tr("summary.summaryCard.deleteTitle")}
        content={tr("summary.detail.confirmDelete")}
        okText={tr("summary.common.delete")}
        cancelText={tr("summary.common.cancel")}
        okDanger
        okLoading={deleteMu.isPending}
        onOk={() => {
          if (!deleteMu.isPending) deleteMu.mutate();
        }}
      />
      <BaseDialog
        open={regenerateOpen}
        onOpenChange={(next) => {
          if (!next) setRegenerateOpen(false);
        }}
        size="md"
        title={tr("summary.detail.regenerateEditTitle")}
        contentClassName="gap-2 p-4"
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button
              type="tertiary"
              theme="borderless"
              size="small"
              disabled={regenMu.isPending}
              onClick={() => setRegenerateOpen(false)}
            >
              {tr("summary.common.cancel")}
            </Button>
            <Button
              type="primary"
              theme="solid"
              size="small"
              loading={regenMu.isPending}
              disabled={!regenerateTopic.trim()}
              onClick={submitRegenerate}
            >
              {tr("summary.detail.regenerate")}
            </Button>
          </div>
        }
      >
        <label
          htmlFor="summary-regenerate-topic"
          className="text-xs font-medium text-text-secondary"
        >
          {tr("summary.detail.regenerateTopicLabel")}
        </label>
        <textarea
          id="summary-regenerate-topic"
          value={regenerateTopic}
          onChange={(event) => setRegenerateTopic(event.target.value.slice(0, 1000))}
          className="min-h-24 resize-y rounded-md border border-border-default bg-bg-base px-3 py-2 text-sm leading-6 text-text-primary outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
        />
      </BaseDialog>
    </>
  );
}
