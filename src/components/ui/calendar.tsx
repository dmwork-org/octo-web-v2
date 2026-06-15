import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";
import { enUS, zhCN } from "date-fns/locale";
import { useI18n } from "@/lib/i18n/use-i18n";
import { cn } from "@/lib/utils";

/**
 * shadcn/ui Calendar(react-day-picker v10 适配版,跟随应用 locale)。
 *
 * 项目里 DDL pick / 提醒时间 popover 共用。包 PopoverContent 即为弹层模式。
 * 默认 mode="single",单选日期,onSelect 接 Date | undefined。
 */
export type CalendarProps = React.ComponentProps<typeof DayPicker>;

export function Calendar({
  className,
  classNames,
  locale: localeProp,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  const { locale } = useI18n();
  const dayPickerLocale = localeProp ?? (locale === "en-US" ? enUS : zhCN);

  return (
    <DayPicker
      locale={dayPickerLocale}
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row gap-4",
        month: "flex flex-col gap-3",
        month_caption: "flex justify-center pt-1 relative items-center text-sm font-medium",
        caption_label: "text-sm font-medium",
        nav: "flex items-center justify-between absolute inset-x-1 top-1 z-10",
        button_previous: cn(
          "size-7 inline-flex items-center justify-center rounded-md cursor-pointer hover:bg-bg-hover text-text-secondary",
        ),
        button_next: cn(
          "size-7 inline-flex items-center justify-center rounded-md cursor-pointer hover:bg-bg-hover text-text-secondary",
        ),
        month_grid: "w-full border-collapse space-y-1",
        weekdays: "flex",
        weekday: "text-text-tertiary rounded-md w-8 font-normal text-[0.8rem]",
        week: "flex w-full mt-2",
        day: "relative p-0 text-center text-sm",
        day_button:
          "size-8 inline-flex items-center justify-center rounded-md hover:bg-bg-hover aria-selected:opacity-100",
        range_start: "day-range-start",
        range_end: "day-range-end",
        selected:
          "bg-brand text-white hover:bg-brand hover:text-white focus:bg-brand focus:text-white [&>button]:bg-brand [&>button]:text-white",
        today: "bg-bg-elevated text-text-primary [&>button]:font-semibold",
        outside: "text-text-tertiary aria-selected:text-text-tertiary",
        disabled: "text-text-tertiary opacity-40",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: (chevronProps) =>
          chevronProps.orientation === "left" ? (
            <ChevronLeft size={16} />
          ) : (
            <ChevronRight size={16} />
          ),
      }}
      {...props}
    />
  );
}

Calendar.displayName = "Calendar";
