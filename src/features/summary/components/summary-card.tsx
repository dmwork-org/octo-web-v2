import { Calendar, Users } from "lucide-react";
import { useT } from "@/lib/i18n/use-t";
import type { SummaryListItem } from "@/features/summary/types/summary.types";
import { SummaryStatusBadge } from "@/features/summary/components/summary-status-badge";

interface SummaryCardProps {
  item: SummaryListItem;
  selected: boolean;
  onClick: () => void;
}

function formatRange(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const sameDay =
    s.getFullYear() === e.getFullYear() &&
    s.getMonth() === e.getMonth() &&
    s.getDate() === e.getDate();
  if (sameDay) {
    return `${s.getMonth() + 1}/${s.getDate()} ${String(s.getHours()).padStart(2, "0")}:${String(s.getMinutes()).padStart(2, "0")}-${String(e.getHours()).padStart(2, "0")}:${String(e.getMinutes()).padStart(2, "0")}`;
  }
  return `${s.getMonth() + 1}/${s.getDate()} → ${e.getMonth() + 1}/${e.getDate()}`;
}

/**
 * 总结列表卡(对应旧 SummaryListPage 单行):
 *
 *   {task_no}    [status badge]
 *   {title}
 *   {time range}  · {sources count} 来源 · {total_msg_count} 条
 */
export function SummaryCard({ item, selected, onClick }: SummaryCardProps) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full flex-col gap-1.5 rounded-md px-3 py-2.5 text-left transition-colors duration-150 ease-(--ease-emphasized) ${
        selected ? "bg-brand-tint" : "hover:bg-bg-hover"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] text-text-tertiary">{item.task_no}</span>
        <SummaryStatusBadge status={item.status} />
      </div>
      <h3 className="line-clamp-2 text-sm font-medium leading-snug text-text-primary">
        {item.title}
      </h3>
      <div className="flex items-center gap-3 text-[11px] text-text-tertiary">
        <span className="flex items-center gap-1">
          <Calendar size={11} />
          {formatRange(item.time_range_start, item.time_range_end)}
        </span>
        <span className="flex items-center gap-1">
          <Users size={11} />
          {item.sources.length}
        </span>
        <span>
          {t("summary.summaryCard.msgCountShort", { values: { count: item.total_msg_count } })}
        </span>
      </div>
    </button>
  );
}
