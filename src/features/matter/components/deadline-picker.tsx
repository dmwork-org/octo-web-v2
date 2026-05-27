import { useState } from "react";
import { CalendarDays, X } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useUpdateMatter } from "@/features/matter/mutations/matters.mutation";

interface DeadlinePickerProps {
  matterId: string;
  /** ISO 字符串(后端返回 deadline 字段),null/undefined 表示未设置。 */
  deadline?: string | null;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

/** 把本地选中的 Date 转为后端约定的 ISO(本地时区午夜)。 */
function toIsoLocalMidnight(d: Date): string {
  const local = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
  return local.toISOString();
}

/**
 * Matter 截止日期 popover(对齐 P3-matter 设计稿头部"设置截止日期"按钮):
 * - 未设置:显示 📅 设置截止日期
 * - 已设置:显示 📅 YYYY/M/D + 右侧 ✕ 清除
 * - 点击主区:弹 Calendar popover,选中即提交 useUpdateMatter
 *
 * 提交策略:onSelect 立即触发(无需 Cancel/Confirm),用户可继续点击 ✕ 清除。
 * mutation 错误由 withErrorToast 拦截器统一兜底。
 */
export function DeadlinePicker({ matterId, deadline }: DeadlinePickerProps) {
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

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={updateMu.isPending}
          className="flex items-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-[12px] text-text-secondary transition-colors hover:bg-bg-hover disabled:opacity-50"
        >
          <CalendarDays size={14} />
          {deadline ? formatDate(deadline) : "设置截止日期"}
          {deadline ? (
            <span
              role="button"
              tabIndex={0}
              aria-label="清除截止日期"
              onClick={handleClear}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleClear(e as unknown as React.MouseEvent);
                }
              }}
              className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded text-text-tertiary hover:bg-bg-elevated hover:text-text-primary"
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
