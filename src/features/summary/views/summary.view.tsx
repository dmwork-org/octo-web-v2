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

/**
 * 智能总结主视图(Wave 2):
 *
 *   ┌ 中列 (320)                ┌ 右列 (flex-1)
 *   │ Header(智能总结 + 新建)  │ SummaryDetail
 *   │ 列表(SummaryCard)        │ (markdown 渲染 + 状态轮询 + 重新生成 / 取消 / 删除)
 *   └                            ┘
 *
 * 不做(Wave 3+):个人总结 BY_PERSON、日程任务 schedules、模板、citations 引用面板。
 */
export function SummaryView() {
  const currentSpaceId = useStore(spaceStore, (s) => s.spaceId);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  useResetOnSpaceChange(() => {
    setSelectedId(null);
    setCreateOpen(false);
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
        <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border-subtle bg-bg-surface px-5">
          <span className="text-base font-semibold text-text-primary">智能总结</span>
          <button
            type="button"
            aria-label="新建总结"
            title="新建总结"
            onClick={() => setCreateOpen(true)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
          >
            <Plus size={16} />
          </button>
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
      </aside>

      <SummaryDetail taskId={selectedId} onDeleted={() => setSelectedId(null)} />

      <SummaryCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(id) => {
          setCreateOpen(false);
          setSelectedId(id);
        }}
      />
    </div>
  );
}
