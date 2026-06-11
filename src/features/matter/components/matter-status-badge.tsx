import { useT } from "@/lib/i18n/use-t";
import type { MatterStatus } from "@/features/matter/types/matter.types";

const STATUS_KEY: Record<MatterStatus, string> = {
  open: "matter.status.open",
  done: "matter.status.done",
  archived: "matter.status.archived",
};

/**
 * 视觉:open 用浅蓝;done 用浅绿;archived 用 tertiary 灰。对齐原 dmworktodo。
 */
const STATUS_CLASS: Record<MatterStatus, string> = {
  open: "bg-[#ebf9ff] text-[#005694]",
  done: "bg-[#ecf9ec] text-[#176221]",
  archived: "bg-[rgba(28,28,35,0.04)] text-text-tertiary",
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
