import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import { spaceStore } from "@/features/base/stores/space";
import { useResetOnSpaceChange } from "@/features/base/hooks/use-reset-on-space-change.hook";
import { summariesQueryOptions } from "@/features/summary/queries/summaries.query";
import { SummaryCard } from "@/features/summary/components/summary-card";
import { SummaryDetail } from "@/features/summary/components/summary-detail";

/**
 * 智能总结主视图(对应旧 dmworksummary SummaryListPage 精简):
 *
 *   ┌ 中列 (320)                ┌ 右列 (flex-1)
 *   │ Header(智能总结)         │ SummaryDetail
 *   │ 列表(SummaryCard)        │ (taskId 来源 state)
 *   └                            ┘
 *
 * Wave 1 不做:创建 / 编辑 / 重新生成 / 个人模式 / 日程任务 / 模板 / citations。
 *   - 后续 wave 加 SummaryCreatePage(消息源选择 + 参与者 + 时间范围)
 *   - 日程任务走独立路由 / tab(schedules)
 */
export function SummaryView() {
  const currentSpaceId = useStore(spaceStore, (s) => s.spaceId);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useResetOnSpaceChange(() => {
    setSelectedId(null);
  });

  const { data, isLoading, error } = useQuery({
    ...summariesQueryOptions({ page: 1, page_size: 50, sort_by: "created_at", sort_order: "desc" }),
    enabled: !!currentSpaceId,
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
        <header className="flex h-14 shrink-0 items-center border-b border-border-subtle bg-bg-surface px-5 text-base font-semibold text-text-primary">
          智能总结
        </header>

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
              暂无总结(Wave 2 加创建入口)
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
      </aside>

      <SummaryDetail taskId={selectedId} onDeleted={() => setSelectedId(null)} />
    </div>
  );
}
