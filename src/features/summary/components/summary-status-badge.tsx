import { TaskStatus, type TaskStatusType } from "@/features/summary/types/summary.types";

const LABELS: Record<TaskStatusType, string> = {
  [TaskStatus.PENDING]: "排队中",
  [TaskStatus.WAITING_CONFIRM]: "待确认",
  [TaskStatus.PROCESSING]: "生成中",
  [TaskStatus.COMPLETED]: "已完成",
  [TaskStatus.FAILED]: "失败",
  [TaskStatus.CANCELLED]: "已取消",
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
  const sizeCls = size === "sm" ? "px-1.5 text-[10px]" : "px-2 py-0.5 text-xs";
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-sm font-semibold ${CLS[status]} ${sizeCls}`}
    >
      {LABELS[status]}
    </span>
  );
}
