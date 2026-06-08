import { useT } from "@/lib/i18n/use-t";
import type { MatterStatus } from "@/features/matter/types/matter.types";

const STATUS_KEY: Record<MatterStatus, string> = {
  open: "matter.status.open",
  done: "matter.status.done",
  archived: "matter.status.archived",
};

/**
 * 视觉:open 用 brand 色;done 用 online 色;archived 用 tertiary 灰。
 * 旧项目 dmworktodo TodoStatusBadge 同语义,这里精简为 12px 圆角小标签。
 */
const STATUS_CLASS: Record<MatterStatus, string> = {
  open: "bg-brand-tint text-brand",
  done: "bg-online/10 text-online",
  archived: "bg-bg-elevated text-text-tertiary",
};

interface MatterStatusBadgeProps {
  status: MatterStatus;
  size?: "sm" | "md";
}

export function MatterStatusBadge({ status, size = "sm" }: MatterStatusBadgeProps) {
  const t = useT();
  const cls = STATUS_CLASS[status];
  const sizeCls = size === "sm" ? "px-1.5 text-[10px]" : "px-2 py-0.5 text-xs";
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-sm font-semibold ${cls} ${sizeCls}`}
    >
      {t(STATUS_KEY[status])}
    </span>
  );
}
