import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import { Plus, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/semi-bridge/button";
import { toast } from "@/components/semi-bridge/toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { deleteSummary, respondToTask } from "@/features/summary/api/summary.api";
import { useT } from "@/lib/i18n/use-t";
import { spaceStore } from "@/features/base/stores/space";
import { useResetOnSpaceChange } from "@/features/base/hooks/use-reset-on-space-change.hook";
import { summariesQueryOptions } from "@/features/summary/queries/summaries.query";
import { SummaryCard } from "@/features/summary/components/summary-card";
import { SummaryCreateWorkbench } from "@/features/summary/components/summary-create-workbench";
import { SummaryDetail } from "@/features/summary/components/summary-detail";
import { TaskStatus, type TaskStatusType } from "@/features/summary/types/summary.types";

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 400;
const ALL_STATUS_VALUE = "all";

const STATUS_KEY: Record<TaskStatusType, string> = {
  [TaskStatus.PENDING]: "summary.status.pending",
  [TaskStatus.WAITING_CONFIRM]: "summary.status.waitingConfirm",
  [TaskStatus.PROCESSING]: "summary.status.processing",
  [TaskStatus.COMPLETED]: "summary.status.completed",
  [TaskStatus.FAILED]: "summary.status.failed",
  [TaskStatus.CANCELLED]: "summary.status.cancelled",
};

function useDebouncedKeyword(input: string): string {
  const [keyword, setKeyword] = useState(input);
  useEffect(() => {
    const timer = window.setTimeout(() => setKeyword(input.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [input]);
  return keyword;
}

function useResetSummaryPageOnFilters(
  keyword: string,
  statusFilter: TaskStatusType | undefined,
  setPage: (page: number) => void,
): void {
  useEffect(() => {
    setPage(1);
  }, [keyword, statusFilter, setPage]);
}

/**
 * 智能总结主视图(Wave 3b 加 tab 切换)。
 */
export function SummaryView() {
  const t = useT();
  const qc = useQueryClient();
  const currentSpaceId = useStore(spaceStore, (s) => s.spaceId);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [statusFilter, setStatusFilter] = useState<TaskStatusType | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const keyword = useDebouncedKeyword(searchInput);
  const statusFilterValue = statusFilter === undefined ? ALL_STATUS_VALUE : String(statusFilter);

  useResetOnSpaceChange(() => {
    setSelectedId(null);
    setCreateOpen(false);
    setSearchInput("");
    setStatusFilter(undefined);
    setPage(1);
    setManualRefreshing(false);
  });

  useResetSummaryPageOnFilters(keyword, statusFilter, setPage);

  const listParams = useMemo(
    () => ({
      page,
      page_size: PAGE_SIZE,
      status: statusFilter,
      keyword: keyword || undefined,
      sort_by: "created_at",
      sort_order: "desc" as const,
    }),
    [keyword, page, statusFilter],
  );

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    ...summariesQueryOptions(listParams),
    enabled: !!currentSpaceId,
  });

  const list = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const deleteMu = useMutation({
    mutationFn: deleteSummary,
    onSuccess: (_void, taskId) => {
      void qc.invalidateQueries({ queryKey: ["summary", "list"] });
      toast.success(t("summary.list.deleteSuccess"));
      if (selectedId === taskId) setSelectedId(null);
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("summary.common.deleteFailed")),
  });

  const respondMu = useMutation({
    mutationFn: ({ taskId, action }: { taskId: number; action: "accept" | "reject" }) =>
      respondToTask(taskId, action),
    onSuccess: (_void, vars) => {
      void qc.invalidateQueries({ queryKey: ["summary", "list"] });
      toast.success(
        vars.action === "accept" ? t("summary.action.accepted") : t("summary.action.rejected"),
      );
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("summary.common.operationFailed")),
  });

  if (!currentSpaceId) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-text-tertiary">
        {t("summary.list.spaceRequired")}
      </div>
    );
  }

  const newTooltip = t("summary.tabs.newSummary");
  const refreshList = async () => {
    if (manualRefreshing) return;
    setManualRefreshing(true);
    try {
      await Promise.all([
        refetch(),
        new Promise<void>((resolve) => window.setTimeout(resolve, 450)),
      ]);
    } finally {
      setManualRefreshing(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <aside className="flex min-h-0 w-80 shrink-0 flex-col border-r border-border-subtle bg-bg-base">
        <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border-subtle bg-bg-surface px-5">
          <h2 className="min-w-0 truncate text-[18px] leading-6 font-semibold text-text-primary">
            {t("summary.list.title")}
          </h2>
          <button
            type="button"
            aria-label={newTooltip}
            title={newTooltip}
            onClick={() => {
              setCreateOpen(true);
              setSelectedId(null);
            }}
            className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
          >
            <Plus size={16} />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 flex-col gap-2 border-b border-border-subtle bg-bg-surface px-3 py-3">
            <div className="flex h-9 items-center gap-2 rounded-md border border-transparent bg-bg-elevated px-3 transition-colors focus-within:border-brand">
              <Search size={14} className="text-text-tertiary" />
              <input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder={t("summary.list.searchPlaceholder")}
                className="min-w-0 flex-1 border-0 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-tertiary"
              />
            </div>
            <div className="flex items-center gap-2">
              <Select
                value={statusFilterValue}
                onValueChange={(value) => {
                  setStatusFilter(
                    value === ALL_STATUS_VALUE ? undefined : (Number(value) as TaskStatusType),
                  );
                }}
              >
                <SelectTrigger
                  aria-label={t("summary.list.allStatus")}
                  className="h-9 min-w-0 flex-1 rounded-md border-border-subtle bg-bg-base px-3 text-sm text-text-primary shadow-none hover:bg-bg-hover focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/15"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent
                  position="popper"
                  align="start"
                  className="z-popover min-w-(--radix-select-trigger-width) rounded-md border border-border-default bg-bg-surface p-1 text-text-primary shadow-lg"
                >
                  <SelectItem value={ALL_STATUS_VALUE}>{t("summary.list.allStatus")}</SelectItem>
                  {Object.values(TaskStatus).map((status) => (
                    <SelectItem key={status} value={String(status)}>
                      {t(STATUS_KEY[status])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button
                type="button"
                aria-label={t("summary.list.refresh")}
                title={t("summary.list.refresh")}
                disabled={manualRefreshing}
                onClick={() => void refreshList()}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-bg-hover hover:text-brand disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw
                  size={15}
                  className={manualRefreshing || isFetching ? "animate-spin" : ""}
                />
              </button>
            </div>
          </div>

          <div className="relative flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain px-3 pt-3 pb-4 [scrollbar-gutter:stable]">
            {manualRefreshing ? (
              <div className="pointer-events-none sticky top-0 z-10 flex justify-center">
                <span className="inline-flex items-center gap-1.5 rounded-md border border-border-subtle bg-bg-surface/95 px-2.5 py-1 text-xs text-text-secondary shadow-sm">
                  <RefreshCw size={12} className="animate-spin" />
                  {t("summary.list.refreshing")}
                </span>
              </div>
            ) : null}
            {isLoading ? (
              <div className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
                {t("summary.list.loading")}
              </div>
            ) : error ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 text-sm text-error">
                <span>{t("summary.list.loadFailed")}</span>
                <Button
                  type="tertiary"
                  theme="borderless"
                  size="small"
                  onClick={() => void refetch()}
                >
                  {t("summary.common.retry")}
                </Button>
              </div>
            ) : list.length === 0 ? (
              <div className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
                {t("summary.list.emptyHint")}
              </div>
            ) : (
              list.map((item) => (
                <SummaryCard
                  key={item.task_id}
                  item={item}
                  selected={item.task_id === selectedId}
                  onClick={() => {
                    setCreateOpen(false);
                    setSelectedId(item.task_id);
                  }}
                  onDelete={() => deleteMu.mutate(item.task_id)}
                  onRespond={(action) => respondMu.mutate({ taskId: item.task_id, action })}
                />
              ))
            )}
          </div>

          {totalPages > 1 ? (
            <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border-subtle px-3 py-2 text-xs text-text-tertiary">
              <span>
                {page} / {totalPages}
              </span>
              <div className="flex gap-1">
                <Button
                  type="tertiary"
                  theme="borderless"
                  size="small"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  ←
                </Button>
                <Button
                  type="tertiary"
                  theme="borderless"
                  size="small"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  →
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </aside>

      {createOpen || selectedId === null ? (
        <SummaryCreateWorkbench
          onCreated={(id) => {
            setCreateOpen(false);
            void qc.invalidateQueries({ queryKey: ["summary", "list"] });
            setSelectedId(id);
          }}
        />
      ) : (
        <SummaryDetail taskId={selectedId} onDeleted={() => setSelectedId(null)} />
      )}
    </div>
  );
}
