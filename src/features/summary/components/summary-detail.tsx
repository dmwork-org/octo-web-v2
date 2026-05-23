import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/semi-bridge/button";
import { toast } from "@/components/semi-bridge/toast";
import { deleteSummary } from "@/features/summary/api/summary.api";
import { summaryDetailQueryOptions } from "@/features/summary/queries/summaries.query";
import { SummaryStatusBadge } from "@/features/summary/components/summary-status-badge";
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
 * 总结详情面板(Wave 1 简版):
 * - 顶部:task_no + 状态 + 删除
 * - 主体:title + 时间范围 + 来源 + 参与者 + result.content(markdown 渲染 Wave 2)
 *
 * 不做(Wave 2+):citations 引用面板、重新生成、编辑、参与者状态轮询、个人模式。
 */
export function SummaryDetail({ taskId, onDeleted }: SummaryDetailProps) {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery(summaryDetailQueryOptions(taskId));

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
  const isProcessing = data.status === TaskStatus.PROCESSING || data.status === TaskStatus.PENDING;

  return (
    <section className="flex flex-1 flex-col overflow-hidden">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border-subtle bg-bg-surface px-6 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="font-mono text-xs text-text-tertiary">{data.task_no}</span>
          <SummaryStatusBadge status={data.status} size="md" />
        </div>
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
            <p className="text-sm italic text-text-tertiary">总结生成中,稍后刷新查看…</p>
          ) : isFailed ? (
            <p className="text-sm text-error">{data.error_message ?? "生成失败"}</p>
          ) : data.result ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-text-primary">
              {data.result.content}
            </p>
          ) : (
            <p className="text-sm italic text-text-tertiary">暂无内容</p>
          )}
        </div>
      </div>
    </section>
  );
}
