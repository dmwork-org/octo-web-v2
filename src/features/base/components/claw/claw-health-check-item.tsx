/**
 * 健康检查单项(对齐老仓 `ClawHealthCheckItem`):彩色圆点 + label + value 横排。
 */

export type HealthStatus = "success" | "warning" | "error";

interface ClawHealthCheckItemProps {
  status: HealthStatus;
  label: string;
  value: string;
}

const DOT_COLOR: Record<HealthStatus, string> = {
  success: "bg-[#22c55e]",
  warning: "bg-[#f59e0b]",
  error: "bg-[#ef4444]",
};

export function ClawHealthCheckItem({ status, label, value }: ClawHealthCheckItemProps) {
  return (
    <div className="flex min-w-[160px] items-center gap-2 rounded-lg border border-border-default bg-[rgba(0,0,0,0.02)] px-3 py-2.5">
      <span className={`h-2 w-2 shrink-0 rounded-full ${DOT_COLOR[status]}`} />
      <span className="text-[13px] text-text-secondary">{label}</span>
      <span className="ml-auto text-[12px] text-text-tertiary">{value}</span>
    </div>
  );
}
