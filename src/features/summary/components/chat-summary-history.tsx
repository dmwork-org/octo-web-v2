import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "@/components/semi-bridge/toast";
import { useT } from "@/lib/i18n/use-t";
import { t } from "@/lib/i18n/instance";
import { deleteSummary } from "@/features/summary/api/summary.api";
import {
  summariesQueryKey,
  summariesQueryOptions,
} from "@/features/summary/queries/summaries.query";
import { SummaryCard } from "@/features/summary/components/summary-card";
import {
  notifyChatSummaryDeleted,
  subscribeChatSummaryEvents,
} from "@/features/summary/utils/chat-summary-events";

interface ChatSummaryHistoryProps {
  channel: { channelID: string; channelType: number };
  /** 选中某条进详情(panel 层把它写到 chatSidePanelStore.selectSummary) */
  onSelect: (taskId: number) => void;
  /** 点"新建总结"虚框时回调(panel 层弹 ChatSummaryNewModal) */
  onCreateNew: () => void;
}

/**
 * Chat panel 内"当前会话的总结历史"。
 *
 * - 按 `origin_channel_id` 过滤拉列表;summariesQueryOptions 自带轮询(PENDING/
 *   PROCESSING/WAITING_CONFIRM 任意一条 active 时 5s refetch),无需手写
 *   setInterval(对齐老仓 doBatchPoll 但走 React Query 调度)。
 * - 订阅 chat-summary-created / chat-summary-deleted CustomEvent:其他位置创建/
 *   删除时,本面板 invalidate 自动 refetch。
 * - 删除走 mutation,成功后 dispatch chat-summary-deleted 让 star button 同步刷计数。
 */
export function ChatSummaryHistory({ channel, onSelect, onCreateNew }: ChatSummaryHistoryProps) {
  const tr = useT();
  const qc = useQueryClient();
  const queryParams = {
    origin_channel_id: channel.channelID,
    page: 1,
    page_size: 50,
    sort_by: "created_at",
    sort_order: "desc" as const,
  };

  const { data, isLoading, error } = useQuery(summariesQueryOptions(queryParams));
  const items = data?.items ?? [];

  useSubscribeChannelEvents(channel.channelID, () => {
    void qc.invalidateQueries({ queryKey: summariesQueryKey(queryParams) });
  });

  const delMu = useMutation({
    mutationFn: (taskId: number) => deleteSummary(taskId),
    onSuccess: () => {
      notifyChatSummaryDeleted({ channelId: channel.channelID });
      // 自身订阅 chat-summary-deleted 也会触发 invalidate,这里冗余调一次保证当前面板
      // 立即更新(避免 event 异步丢)。
      void qc.invalidateQueries({ queryKey: summariesQueryKey(queryParams) });
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("summary.common.deleteFailed")),
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
      <button
        type="button"
        onClick={onCreateNew}
        className="flex shrink-0 items-center justify-center gap-1 rounded-md border border-dashed border-border-default px-3 py-3 text-sm text-text-secondary transition-colors hover:border-brand hover:bg-brand-tint/40 hover:text-brand"
      >
        <Plus size={14} />
        {tr("summary.chatSummary.createNew")}
      </button>

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center text-xs text-text-tertiary">
          {tr("summary.common.loading")}
        </div>
      ) : error ? (
        <div className="flex flex-1 items-center justify-center text-xs text-error">
          {tr("summary.list.loadFailed")}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-xs text-text-tertiary">
          {tr("summary.list.emptyTitle")}
        </div>
      ) : (
        items.map((item) => (
          <SummaryCardWithDelete
            key={item.task_id}
            item={item}
            onClick={() => onSelect(item.task_id)}
            onDelete={() => delMu.mutate(item.task_id)}
          />
        ))
      )}
    </div>
  );
}

/**
 * SummaryCard 包装,加一个右上 hover 删除按钮(对齐老仓 SummaryCard onDelete 行为)。
 * 不动 SummaryCard 本体,避免影响主 SummaryView 列表风格。
 */
function SummaryCardWithDelete({
  item,
  onClick,
  onDelete,
}: {
  item: Parameters<typeof SummaryCard>[0]["item"];
  onClick: () => void;
  onDelete: () => void;
}) {
  const tr = useT();
  return (
    <div className="group relative [&>div>div:first-of-type]:pr-8">
      <SummaryCard item={item} selected={false} onClick={onClick} />
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (confirm(tr("summary.common.deleteConfirm"))) onDelete();
        }}
        className="absolute top-2 right-2 z-10 hidden h-6 w-6 items-center justify-center rounded-md bg-bg-surface text-text-tertiary opacity-0 transition-opacity group-hover:flex group-hover:opacity-100 hover:text-error"
        aria-label={tr("summary.common.delete")}
      >
        ×
      </button>
    </div>
  );
}

function useSubscribeChannelEvents(channelId: string, cb: () => void): void {
  useEffect(() => subscribeChatSummaryEvents(channelId, cb), [channelId, cb]);
}
