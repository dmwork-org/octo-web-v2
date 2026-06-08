import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCcw, Trash2, X as XIcon } from "lucide-react";
import { Button } from "@/components/semi-bridge/button";
import { toast } from "@/components/semi-bridge/toast";
import { useT } from "@/lib/i18n/use-t";
import { t } from "@/lib/i18n/instance";
import {
  cancelSummary,
  deleteSummary,
  regenerateSummary,
} from "@/features/summary/api/summary.api";
import {
  summaryDetailQueryKey,
  summaryDetailQueryOptions,
} from "@/features/summary/queries/summaries.query";
import { SummaryStatusBadge } from "@/features/summary/components/summary-status-badge";
import { SummaryContent } from "@/features/summary/components/summary-content";
import { CitationText } from "@/features/summary/components/citation-text";
import { PersonalSection } from "@/features/summary/components/personal-section";
import { SummaryMode, TaskStatus } from "@/features/summary/types/summary.types";

interface SummaryDetailProps {
  taskId: number | null;
  onDeleted: () => void;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * 总结详情面板。
 */
export function SummaryDetail({ taskId, onDeleted }: SummaryDetailProps) {
  const tr = useT();
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery(summaryDetailQueryOptions(taskId));

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["summary", "list"] });
    if (taskId !== null) {
      void qc.invalidateQueries({ queryKey: summaryDetailQueryKey(taskId) });
    }
  };

  const regenMu = useMutation({
    mutationFn: () => regenerateSummary(taskId!),
    onSuccess: () => {
      invalidate();
      toast.success(t("summary.detail.regenerateTriggered"));
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
      void qc.invalidateQueries({ queryKey: ["summary", "list"] });
      toast.success(t("summary.detail.deletedToast"));
      onDeleted();
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("summary.detail.deleteFailed")),
  });

  if (taskId === null) {
    return (
      <section className="flex flex-1 flex-col items-center justify-center text-sm text-text-tertiary">
        {tr("summary.detail.empty")}
      </section>
    );
  }
  if (isLoading) {
    return (
      <section className="flex flex-1 flex-col items-center justify-center text-sm text-text-tertiary">
        {tr("summary.detail.loading")}
      </section>
    );
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
  const canRegen = isCompleted || isFailed;
  const canCancel = isProcessing;
  const citations = data.result?.citations;
  const hasCitations = !!citations && citations.length > 0;
  const isPersonalMode = data.summary_mode === SummaryMode.BY_PERSON;

  return (
    <section className="flex flex-1 flex-col overflow-hidden">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border-subtle bg-bg-surface px-6 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="font-mono text-xs text-text-tertiary">{data.task_no}</span>
          <SummaryStatusBadge status={data.status} size="md" />
          {isPersonalMode ? (
            <span className="rounded-sm bg-bg-elevated px-1.5 text-[10px] text-text-tertiary">
              {tr("summary.detail.modeBadgeByPerson")}
            </span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {canRegen ? (
            <Button
              type="tertiary"
              theme="borderless"
              size="small"
              loading={regenMu.isPending}
              onClick={() => regenMu.mutate()}
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
            loading={deleteMu.isPending}
            onClick={() => {
              if (window.confirm(t("summary.detail.confirmDelete"))) deleteMu.mutate();
            }}
          >
            <Trash2 size={14} />
          </Button>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
        <h1 className="text-xl font-semibold text-text-primary">{data.title}</h1>

        <dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-2 text-xs">
          <dt className="text-text-tertiary">{tr("summary.detail.timeRangeLabel")}</dt>
          <dd className="text-text-primary">
            {formatTime(data.time_range_start)} → {formatTime(data.time_range_end)}
          </dd>
          <dt className="text-text-tertiary">{tr("summary.detail.sourcesLabel")}</dt>
          <dd className="text-text-primary">
            {data.sources.length > 0
              ? data.sources.map((s) => s.source_name ?? s.source_id).join(", ")
              : "—"}
          </dd>
          <dt className="text-text-tertiary">{tr("summary.detail.participantsLabel")}</dt>
          <dd className="text-text-primary">
            {data.participants.length > 0
              ? data.participants.map((p) => p.user_name ?? p.user_id).join(", ")
              : "—"}
          </dd>
          <dt className="text-text-tertiary">{tr("summary.detail.createdAtLabel")}</dt>
          <dd className="text-text-primary">{formatTime(data.created_at)}</dd>
        </dl>

        <div className="border-t border-border-subtle pt-4">
          <h2 className="mb-2 text-sm font-semibold text-text-secondary">
            {isPersonalMode
              ? tr("summary.detail.summaryResultTitle")
              : tr("summary.detail.summaryContentTitle")}
            {hasCitations ? (
              <span className="ml-2 text-xs font-normal text-text-tertiary">
                {tr("summary.detail.citationsCount", { values: { count: citations!.length } })}
              </span>
            ) : null}
          </h2>
          {isProcessing ? (
            <p className="text-sm italic text-text-tertiary">
              {isPersonalMode
                ? tr("summary.detail.waitingPersonalSubmit")
                : tr("summary.detail.processingDescShort")}
            </p>
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
            <p className="text-sm italic text-text-tertiary">{tr("summary.detail.emptyContent")}</p>
          ) : null}
        </div>

        {isPersonalMode ? <PersonalSection detail={data} /> : null}
      </div>
    </section>
  );
}
