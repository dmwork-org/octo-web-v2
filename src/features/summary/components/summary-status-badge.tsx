import { TaskStatus, type TaskStatusType } from "@/features/summary/types/summary.types";
import { useT } from "@/lib/i18n/use-t";

const LABEL_KEY: Record<TaskStatusType, string> = {
  [TaskStatus.PENDING]: "summary.status.pending",
  [TaskStatus.WAITING_CONFIRM]: "summary.status.waitingConfirm",
  [TaskStatus.PROCESSING]: "summary.status.processing",
  [TaskStatus.COMPLETED]: "summary.status.completed",
  [TaskStatus.FAILED]: "summary.status.failed",
  [TaskStatus.CANCELLED]: "summary.status.cancelled",
};

const CLS: Record<TaskStatusType, string> = {
  [TaskStatus.PENDING]: "bg-bg-elevated text-text-tertiary",
  [TaskStatus.WAITING_CONFIRM]: "bg-warning/10 text-warning",
  [TaskStatus.PROCESSING]: "bg-brand-tint text-brand",
  [TaskStatus.COMPLETED]: "bg-online/10 text-online",
  [TaskStatus.FAILED]: "bg-error/10 text-error",
  [TaskStatus.CANCELLED]: "bg-bg-elevated text-text-tertiary",
};

interface SummaryStatusBadgeProps {
  status: TaskStatusType;
  size?: "sm" | "md";
}

export function SummaryStatusBadge({ status, size = "sm" }: SummaryStatusBadgeProps) {
  const t = useT();
  const sizeCls = size === "sm" ? "px-1.5 text-[10px]" : "px-2 py-0.5 text-xs";
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-sm font-semibold ${CLS[status]} ${sizeCls}`}
    >
      {t(LABEL_KEY[status])}
    </span>
  );
}
