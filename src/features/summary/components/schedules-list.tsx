import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "@/components/semi-bridge/toast";
import { deleteSchedule, toggleSchedule } from "@/features/summary/api/summary.api";
import {
  schedulesQueryKey,
  schedulesQueryOptions,
} from "@/features/summary/queries/summaries.query";
import { ScheduleFormModal } from "@/features/summary/components/schedule-form-modal";
import {
  SummaryMode,
  TimeRangeTypeLabel,
  type ScheduleItem,
} from "@/features/summary/types/summary.types";

/** cron 5 段 → 中文可读(对应旧 cronToLabel)。 */
function cronToLabel(cronExpr: string): string {
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length !== 5) return cronExpr;
  const [minStr, hourStr, dom, , dow] = parts;
  const pad = (s: string) => s.padStart(2, "0");
  const timeStr = `${pad(hourStr)}:${pad(minStr)}`;
  const dowLabels = ["日", "一", "二", "三", "四", "五", "六"];
  if (dom !== "*") return `每月${dom}日 ${timeStr}`;
  if (dow !== "*") {
    if (dow === "1-5") return `工作日 ${timeStr}`;
    const n = parseInt(dow, 10);
    const label = Number.isFinite(n) ? (dowLabels[n] ?? dow) : dow;
    return `每周${label} ${timeStr}`;
  }
  return `每天 ${timeStr}`;
}

function formatNextRun(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

interface ScheduleRowProps {
  item: ScheduleItem;
  onEdit: () => void;
}

function ScheduleRow({ item, onEdit }: ScheduleRowProps) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: schedulesQueryKey });

  const toggleMu = useMutation({
    mutationFn: (next: boolean) => toggleSchedule(item.schedule_id, next),
    onSuccess: () => void invalidate(),
    onError: (err) => toast.error(err instanceof Error ? err.message : "切换失败"),
  });

  const delMu = useMutation({
    mutationFn: () => deleteSchedule(item.schedule_id),
    onSuccess: () => {
      void invalidate();
      toast.success("已删除");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "删除失败"),
  });

  const modeLabel = item.summary_mode === SummaryMode.BY_GROUP ? "按群" : "按人";

  return (
    <div className="group flex items-start justify-between gap-3 rounded-md border border-border-subtle bg-bg-surface px-3 py-2.5 hover:border-border-default">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-text-primary">
            {item.title || "未命名"}
          </span>
          <span className="shrink-0 rounded-sm bg-bg-elevated px-1.5 text-[10px] text-text-tertiary">
            {modeLabel}
          </span>
          {!item.is_active ? (
            <span className="shrink-0 rounded-sm bg-bg-elevated px-1.5 text-[10px] text-text-tertiary">
              已暂停
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-text-tertiary">
          <span>{cronToLabel(item.cron_expr)}</span>
          <span>·</span>
          <span>{TimeRangeTypeLabel[item.time_range_type]}</span>
          <span>·</span>
          <span>{item.sources.length} 个来源</span>
          <span>·</span>
          <span>下次:{formatNextRun(item.next_run_at)}</span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <label
          className="flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-text-tertiary hover:bg-bg-hover"
          title={item.is_active ? "暂停" : "启用"}
        >
          <input
            type="checkbox"
            checked={item.is_active}
            disabled={toggleMu.isPending}
            onChange={(e) => toggleMu.mutate(e.target.checked)}
            className="shrink-0"
          />
          {item.is_active ? "启用" : "暂停"}
        </label>
        <button
          type="button"
          onClick={onEdit}
          aria-label="编辑"
          className="flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
        >
          <Pencil size={13} />
        </button>
        <button
          type="button"
          aria-label="删除"
          disabled={delMu.isPending}
          onClick={() => {
            if (window.confirm(`确认删除定时总结 "${item.title || "未命名"}"?`)) {
              delMu.mutate();
            }
          }}
          className="flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary hover:bg-bg-hover hover:text-error disabled:opacity-50"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

interface SchedulesListProps {
  /** 父级 + 按钮触发新建,通过此 prop 传 setter */
  createOpen: boolean;
  onCloseCreate: () => void;
}

/**
 * 定时总结列表(Wave 3b 左列替换 summary 列表的"定时"tab):
 *
 * - GET /summary-schedules 拉全;每条 row:title + cron 中文 + 时间范围 + 来源数
 * - 操作:启用 toggle(PUT /toggle) / 编辑(ScheduleFormModal) / 删除
 * - 新建按钮在父 view 顶部,通过 props 控制 modal
 *
 * 旧版还有 schedule 详情页 / 关联 task 列表,P3+ 后续 wave 再补。
 */
export function SchedulesList({ createOpen, onCloseCreate }: SchedulesListProps) {
  const { data, isLoading, error } = useQuery(schedulesQueryOptions());
  const [editing, setEditing] = useState<ScheduleItem | null>(null);

  const list = data ?? [];

  return (
    <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
          加载定时任务…
        </div>
      ) : error ? (
        <div className="flex flex-1 items-center justify-center text-sm text-error">加载失败</div>
      ) : list.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
          暂无定时任务,点右上角 + 新建
        </div>
      ) : (
        list.map((item) => (
          <ScheduleRow key={item.schedule_id} item={item} onEdit={() => setEditing(item)} />
        ))
      )}

      <ScheduleFormModal
        open={createOpen || editing !== null}
        schedule={editing}
        onClose={() => {
          setEditing(null);
          if (createOpen) onCloseCreate();
        }}
      />
    </div>
  );
}
