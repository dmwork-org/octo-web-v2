import { Calendar } from "lucide-react";
import type { Matter } from "@/features/matter/types/matter.types";
import { MatterStatusBadge } from "@/features/matter/components/matter-status-badge";

interface MatterCardProps {
  matter: Matter;
  selected: boolean;
  onClick: () => void;
}

function formatDeadline(deadline: string): string {
  const d = new Date(deadline);
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  return sameYear
    ? `${d.getMonth() + 1}/${d.getDate()}`
    : `${d.getFullYear() % 100}/${d.getMonth() + 1}/${d.getDate()}`;
}

/**
 * Matter 列表卡(对应旧 dmworktodo SidebarCard):
 *
 *   M-{seq_no}    [状态 badge]
 *   {title}                    {DDL ?}
 *   from {source_name?}
 *
 * 视觉:rounded-md 6px padding,hover bg-bg-hover,selected bg-brand-tint。
 */
export function MatterCard({ matter, selected, onClick }: MatterCardProps) {
  const hasDeadline = !!matter.deadline;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full flex-col gap-1.5 rounded-md px-3 py-2.5 text-left transition-colors duration-150 ease-(--ease-emphasized) ${
        selected ? "bg-brand-tint" : "hover:bg-bg-hover"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] text-text-tertiary">M-{matter.seq_no}</span>
        <MatterStatusBadge status={matter.status} />
      </div>
      <h3 className="line-clamp-2 text-sm font-medium leading-snug text-text-primary">
        {matter.title}
      </h3>
      <div className="flex items-center justify-between gap-2 text-[11px] text-text-tertiary">
        <span className="min-w-0 truncate">
          {matter.source_name ? `来源 · ${matter.source_name}` : ""}
        </span>
        {hasDeadline ? (
          <span className="flex shrink-0 items-center gap-1">
            <Calendar size={11} />
            {formatDeadline(matter.deadline!)}
          </span>
        ) : null}
      </div>
    </button>
  );
}
