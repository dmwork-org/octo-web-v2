import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { message } from "@/components/ui/message";
import { useT } from "@/lib/i18n/use-t";
import { t } from "@/lib/i18n/instance";
import { ConfirmDialog } from "@/features/base/components/overlay/confirm-dialog";
import { deleteSchedule, toggleSchedule } from "@/features/summary/api/summary.api";
import {
  schedulesQueryKey,
  schedulesQueryOptions,
} from "@/features/summary/queries/summaries.query";
import { ScheduleFormModal } from "@/features/summary/components/schedule-form-modal";
import {
  SummaryMode,
  TIME_RANGE_TYPE_KEY,
  type ScheduleItem,
} from "@/features/summary/types/summary.types";
import { describeSchedule, formatNextRunAt } from "@/features/summary/utils/summary-schedule";

interface ScheduleRowProps {
  item: ScheduleItem;
  onEdit: () => void;
}

function ScheduleRow({ item, onEdit }: ScheduleRowProps) {
  const tr = useT();
  const qc = useQueryClient();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const invalidate = () => qc.invalidateQueries({ queryKey: schedulesQueryKey });

  const toggleMu = useMutation({
    mutationFn: (next: boolean) => toggleSchedule(item.schedule_id, next),
    onSuccess: () => void invalidate(),
    onError: (err) =>
      message.error(err instanceof Error ? err.message : t("summary.schedule.toggleFailed")),
  });

  const delMu = useMutation({
    mutationFn: () => deleteSchedule(item.schedule_id),
    onSuccess: () => {
      setDeleteConfirmOpen(false);
      void invalidate();
      message.success(t("summary.schedule.deleted"));
    },
    onError: (err) =>
      message.error(err instanceof Error ? err.message : t("summary.common.deleteFailed")),
  });

  const modeLabel =
    item.summary_mode === SummaryMode.BY_GROUP
      ? tr("summary.schedule.modeByGroupShort")
      : tr("summary.schedule.modeByPersonShort");
  const timeRangeKey = TIME_RANGE_TYPE_KEY[item.time_range_type] ?? TIME_RANGE_TYPE_KEY[2];
  const sourceCount = item.sources?.length ?? 0;

  return (
    <>
      <div className="group flex items-start justify-between gap-3 rounded-md border border-border-subtle bg-bg-surface px-3 py-2.5 hover:border-border-default">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-text-primary">
              {item.title || tr("summary.schedule.unnamed")}
            </span>
            <span className="shrink-0 rounded-sm bg-bg-elevated px-1.5 text-[10px] text-text-tertiary">
              {modeLabel}
            </span>
            {!item.is_active ? (
              <span className="shrink-0 rounded-sm bg-bg-elevated px-1.5 text-[10px] text-text-tertiary">
                {tr("summary.schedule.paused")}
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-text-tertiary">
            <span>{describeSchedule(item, t)}</span>
            <span>·</span>
            <span>{tr(timeRangeKey)}</span>
            <span>·</span>
            <span>{tr("summary.schedule.sourcesCount", { values: { count: sourceCount } })}</span>
            <span>·</span>
            <span>
              {tr("summary.schedule.nextRun", {
                values: { time: formatNextRunAt(item.next_run_at) },
              })}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <label
            className="flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-text-tertiary hover:bg-bg-hover"
            title={item.is_active ? tr("summary.schedule.pause") : tr("summary.schedule.enable")}
          >
            <input
              type="checkbox"
              checked={item.is_active}
              disabled={toggleMu.isPending}
              onChange={(e) => toggleMu.mutate(e.target.checked)}
              className="shrink-0"
            />
            {item.is_active ? tr("summary.schedule.enable") : tr("summary.schedule.pause")}
          </label>
          <button
            type="button"
            onClick={onEdit}
            aria-label={tr("summary.schedule.editAria")}
            className="flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
          >
            <Pencil size={13} />
          </button>
          <button
            type="button"
            aria-label={tr("summary.schedule.deleteAria")}
            disabled={delMu.isPending}
            onClick={() => setDeleteConfirmOpen(true)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary hover:bg-bg-hover hover:text-error disabled:opacity-50"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title={tr("summary.schedule.deleteTitle")}
        content={tr("summary.schedule.deleteConfirm", {
          values: { title: item.title || tr("summary.schedule.unnamed") },
        })}
        okText={tr("summary.common.delete")}
        cancelText={tr("summary.common.cancel")}
        okDanger
        okLoading={delMu.isPending}
        onOk={() => {
          if (!delMu.isPending) delMu.mutate();
        }}
      />
    </>
  );
}

interface SchedulesListProps {
  /** 父级 + 按钮触发新建,通过此 prop 传 setter */
  createOpen: boolean;
  onCloseCreate: () => void;
}

/**
 * 定时总结列表(Wave 3b 左列替换 summary 列表的"定时"tab)。
 */
export function SchedulesList({ createOpen, onCloseCreate }: SchedulesListProps) {
  const tr = useT();
  const { data, isLoading, error } = useQuery(schedulesQueryOptions());
  const [editing, setEditing] = useState<ScheduleItem | null>(null);

  const list = data ?? [];

  return (
    <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
          {tr("summary.schedule.loading")}
        </div>
      ) : error ? (
        <div className="flex flex-1 items-center justify-center text-sm text-error">
          {tr("summary.schedule.loadFailed")}
        </div>
      ) : list.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
          {tr("summary.schedule.emptyHint")}
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
