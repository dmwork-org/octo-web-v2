import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import { Plus } from "lucide-react";
import { spaceStore } from "@/features/base/stores/space";
import { useResetOnSpaceChange } from "@/features/base/hooks/use-reset-on-space-change.hook";
import { summariesQueryOptions } from "@/features/summary/queries/summaries.query";
import { SummaryCard } from "@/features/summary/components/summary-card";
import { SummaryDetail } from "@/features/summary/components/summary-detail";
import { SummaryCreateModal } from "@/features/summary/components/summary-create-modal";
import { SchedulesList } from "@/features/summary/components/schedules-list";

type Tab = "summaries" | "schedules";

const TAB_LABEL: Record<Tab, string> = {
  summaries: "总结",
  schedules: "定时",
};

/**
 * 智能总结主视图(Wave 3b 加 tab 切换):
 *
 *   ┌ 中列 (320)                ┌ 右列 (flex-1)
 *   │ Header(tab + 新建)       │ SummaryDetail / 空白
 *   │ 总结 list / 定时 list     │
 *   └                            ┘
 *
 * - tab=summaries:列表 + SummaryDetail
 * - tab=schedules:列表 + 编辑 modal,右列保持空白(旧版进入 schedule 详情页留 wave +)
 */
export function SummaryView() {
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
        先在顶部切换到一个 Space,才能加载总结
      </div>
    );
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <aside className="flex w-80 shrink-0 flex-col border-r border-border-subtle bg-bg-base">
        <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border-subtle bg-bg-surface px-4">
          <div className="flex shrink-0 items-center gap-1">
            {(Object.keys(TAB_LABEL) as Tab[]).map((k) => (
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
                {TAB_LABEL[k]}
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-label={tab === "summaries" ? "新建总结" : "新建定时任务"}
            title={tab === "summaries" ? "新建总结" : "新建定时任务"}
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
                加载总结…
              </div>
            ) : error ? (
              <div className="flex flex-1 items-center justify-center text-sm text-error">
                总结加载失败
              </div>
            ) : list.length === 0 ? (
              <div className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
                暂无总结,点右上角 + 新建
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
          从左侧编辑或新建定时任务
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
