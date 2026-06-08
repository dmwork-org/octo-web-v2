import { useState } from "react";
import { X } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useT } from "@/lib/i18n/use-t";
import { useUpdateMatter } from "@/features/matter/mutations/matters.mutation";

interface DeadlinePickerProps {
  matterId: string;
  /** ISO 字符串(后端返回 deadline 字段),null/undefined 表示未设置。 */
  deadline?: string | null;
}

const WEEKDAY_KEYS = [
  "matter.weekday.sun",
  "matter.weekday.mon",
  "matter.weekday.tue",
  "matter.weekday.wed",
  "matter.weekday.thu",
  "matter.weekday.fri",
  "matter.weekday.sat",
];

/** 把本地选中的 Date 转为后端约定的 ISO(本地时区午夜)。 */
function toIsoLocalMidnight(d: Date): string {
  const local = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
  return local.toISOString();
}

/**
 * 简笔封套日历 SVG(对齐原 dmworktodo SidebarCard 同款 path)。
 */
function CalendarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 12 12" fill="none" aria-hidden className="shrink-0">
      <path
        d="M4 1v1.5M8 1v1.5M1.5 4.5h9M2.5 2.5h7a1 1 0 011 1v6a1 1 0 01-1 1h-7a1 1 0 01-1-1v-6a1 1 0 011-1z"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Matter 截止日期 popover(对齐 P3-matter 设计稿头部"截止到 5/29 周五"按钮):
 * - 未设置:📅 设置截止日期(text-tertiary 灰)
 * - 已设置:📅 截止到 5/29 周五 + ✕ 清除
 * - 点击主区:弹 Calendar popover,选中即提交 useUpdateMatter
 *
 * 提交策略:onSelect 立即触发,无 Cancel/Confirm。错误由 withErrorToast 兜底。
 */
export function DeadlinePicker({ matterId, deadline }: DeadlinePickerProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const updateMu = useUpdateMatter();

  const handleSelect = (d: Date | undefined) => {
    if (!d) return;
    setOpen(false);
    updateMu.mutate({ matterId, req: { deadline: toIsoLocalMidnight(d) } });
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    updateMu.mutate({ matterId, req: { deadline: null } });
  };

  const selectedDate = deadline ? new Date(deadline) : undefined;

  const formatDeadlineLabel = (iso: string): string => {
    const d = new Date(iso);
    return t("matter.deadline.untilMonthDayWeekday", {
      values: {
        month: d.getMonth() + 1,
        day: d.getDate(),
        weekday: t(WEEKDAY_KEYS[d.getDay()]),
      },
    });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={updateMu.isPending}
          className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-sm leading-[18px] text-text-tertiary transition-colors hover:text-text-primary disabled:opacity-50"
        >
          <CalendarIcon />
          {deadline ? formatDeadlineLabel(deadline) : t("matter.deadline.set")}
          {deadline ? (
            <span
              role="button"
              tabIndex={0}
              aria-label={t("matter.deadline.clear")}
              onClick={handleClear}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleClear(e as unknown as React.MouseEvent);
                }
              }}
              className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded text-text-tertiary hover:bg-bg-elevated hover:text-text-primary"
            >
              <X size={10} />
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={selectedDate} onSelect={handleSelect} />
      </PopoverContent>
    </Popover>
  );
}
