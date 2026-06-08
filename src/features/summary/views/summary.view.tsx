import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import { Plus } from "lucide-react";
import { useT } from "@/lib/i18n/use-t";
import { spaceStore } from "@/features/base/stores/space";
import { useResetOnSpaceChange } from "@/features/base/hooks/use-reset-on-space-change.hook";
import { summariesQueryOptions } from "@/features/summary/queries/summaries.query";
import { SummaryCard } from "@/features/summary/components/summary-card";
import { SummaryDetail } from "@/features/summary/components/summary-detail";
import { SummaryCreateModal } from "@/features/summary/components/summary-create-modal";
import { SchedulesList } from "@/features/summary/components/schedules-list";

type Tab = "summaries" | "schedules";

const TAB_KEY: Record<Tab, string> = {
  summaries: "summary.tabs.summaries",
  schedules: "summary.tabs.schedules",
};

/**
 * 智能总结主视图(Wave 3b 加 tab 切换)。
 */
export function SummaryView() {
  const t = useT();
  const currentSpaceId = useStore(spaceStore, (s) => s.spaceId);
  const [tab, setTab] = useState<Tab>("summaries");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  useResetOnSpaceChange(() => {
    setSelectedId(null);
    setCreateOpen(false);
    setTab("summaries");
  });

  const { data, isLoading, error } = useQuery({
    ...summariesQueryOptions({ page: 1, page_size: 50, sort_by: "created_at", sort_order: "desc" }),
    enabled: !!currentSpaceId && tab === "summaries",
  });

  const list = data?.items ?? [];

  if (!currentSpaceId) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-text-tertiary">
        {t("summary.list.spaceRequired")}
      </div>
    );
  }

  const newTooltip =
    tab === "summaries" ? t("summary.tabs.newSummary") : t("summary.tabs.newSchedule");

  return (
    <div className="flex flex-1 overflow-hidden">
      <aside className="flex w-80 shrink-0 flex-col border-r border-border-subtle bg-bg-base">
        <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border-subtle bg-bg-surface px-4">
          <div className="flex shrink-0 items-center gap-1">
            {(Object.keys(TAB_KEY) as Tab[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={`rounded-md px-2.5 py-1 text-sm transition-colors ${
                  tab === k
                    ? "bg-bg-elevated font-semibold text-text-primary"
                    : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                }`}
              >
                {t(TAB_KEY[k])}
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-label={newTooltip}
            title={newTooltip}
            onClick={() => setCreateOpen(true)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
          >
            <Plus size={16} />
          </button>
        </header>

        {tab === "summaries" ? (
          <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
            {isLoading ? (
              <div className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
                {t("summary.list.loading")}
              </div>
            ) : error ? (
              <div className="flex flex-1 items-center justify-center text-sm text-error">
                {t("summary.list.loadFailed")}
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
                  onClick={() => setSelectedId(item.task_id)}
                />
              ))
            )}
          </div>
        ) : (
          <SchedulesList createOpen={createOpen} onCloseCreate={() => setCreateOpen(false)} />
        )}
      </aside>

      {tab === "summaries" ? (
        <SummaryDetail taskId={selectedId} onDeleted={() => setSelectedId(null)} />
      ) : (
        <section className="flex flex-1 flex-col items-center justify-center text-sm text-text-tertiary">
          {t("summary.schedules.emptyRight")}
        </section>
      )}

      <SummaryCreateModal
        open={createOpen && tab === "summaries"}
        onClose={() => setCreateOpen(false)}
        onCreated={(id) => {
          setCreateOpen(false);
          setSelectedId(id);
        }}
      />
    </div>
  );
}
