import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCcw, Trash2, X as XIcon } from "lucide-react";
import { Button } from "@/components/semi-bridge/button";
import { toast } from "@/components/semi-bridge/toast";
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
import { TaskStatus } from "@/features/summary/types/summary.types";

interface SummaryDetailProps {
  taskId: number | null;
  onDeleted: () => void;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * 总结详情面板:
 * - 顶部:task_no + 状态 + 重新生成 / 取消 / 删除(根据 status 智能显示)
 * - 主体:title + 元数据 + result.content(markdown)
 * - 状态轮询由 summaryDetailQueryOptions 内部 refetchInterval 处理
 *
 * Wave 3 加:citations 引用面板、编辑 result。
 */
export function SummaryDetail({ taskId, onDeleted }: SummaryDetailProps) {
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
      toast.success("已触发重新生成");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "重新生成失败"),
  });

  const cancelMu = useMutation({
    mutationFn: () => cancelSummary(taskId!),
    onSuccess: () => {
      invalidate();
      toast.success("已取消");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "取消失败"),
  });

  const deleteMu = useMutation({
    mutationFn: () => deleteSummary(taskId!),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["summary", "list"] });
      toast.success("已删除");
      onDeleted();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "删除失败"),
  });

  if (taskId === null) {
    return (
      <section className="flex flex-1 flex-col items-center justify-center text-sm text-text-tertiary">
        从左侧选一个总结查看详情
      </section>
    );
  }
  if (isLoading) {
    return (
      <section className="flex flex-1 flex-col items-center justify-center text-sm text-text-tertiary">
        加载详情…
      </section>
    );
  }
  if (error || !data) {
    return (
      <section className="flex flex-1 flex-col items-center justify-center text-sm text-error">
        详情加载失败
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

  return (
    <section className="flex flex-1 flex-col overflow-hidden">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border-subtle bg-bg-surface px-6 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="font-mono text-xs text-text-tertiary">{data.task_no}</span>
          <SummaryStatusBadge status={data.status} size="md" />
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
              重新生成
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
              取消任务
            </Button>
          ) : null}
          <Button
            type="danger"
            theme="borderless"
            size="small"
            iconOnly
            loading={deleteMu.isPending}
            onClick={() => {
              if (window.confirm("确认删除该总结?")) deleteMu.mutate();
            }}
          >
            <Trash2 size={14} />
          </Button>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
        <h1 className="text-xl font-semibold text-text-primary">{data.title}</h1>

        <dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-2 text-xs">
          <dt className="text-text-tertiary">时间范围</dt>
          <dd className="text-text-primary">
            {formatTime(data.time_range_start)} → {formatTime(data.time_range_end)}
          </dd>
          <dt className="text-text-tertiary">信息来源</dt>
          <dd className="text-text-primary">
            {data.sources.length > 0
              ? data.sources.map((s) => s.source_name ?? s.source_id).join(", ")
              : "—"}
          </dd>
          <dt className="text-text-tertiary">参与者</dt>
          <dd className="text-text-primary">
            {data.participants.length > 0
              ? data.participants.map((p) => p.user_name ?? p.user_id).join(", ")
              : "—"}
          </dd>
          <dt className="text-text-tertiary">创建时间</dt>
          <dd className="text-text-primary">{formatTime(data.created_at)}</dd>
        </dl>

        <div className="border-t border-border-subtle pt-4">
          <h2 className="mb-2 text-sm font-semibold text-text-secondary">总结内容</h2>
          {isProcessing ? (
            <p className="text-sm italic text-text-tertiary">总结生成中,自动刷新…</p>
          ) : isFailed ? (
            <p className="text-sm text-error">{data.error_message ?? "生成失败"}</p>
          ) : data.result ? (
            <SummaryContent content={data.result.content} />
          ) : (
            <p className="text-sm italic text-text-tertiary">暂无内容</p>
          )}
        </div>
      </div>
    </section>
  );
}
