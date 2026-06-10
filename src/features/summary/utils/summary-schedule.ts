import type { TranslateOptions } from "@/lib/i18n/types";
import type { ScheduleConfig } from "@/features/summary/types/summary.types";

const DAYS_PER_WEEK = 7;
const MAX_INTERVAL_DAYS = 3650;
const MAX_INTERVAL_MONTHS = 120;

type TranslateFn = (key: string, options?: TranslateOptions) => string;

export function scheduleToParams(config: ScheduleConfig): {
  cron_expr: string;
  interval_days: number;
  interval_months: number;
  day_of_week: number;
  day_of_month: number;
  run_time: string;
} {
  const every = Math.max(1, Math.floor(config.every || 1));
  if (config.unit === "month") {
    return {
      cron_expr: "",
      interval_days: 0,
      interval_months: every,
      day_of_week: 0,
      day_of_month: config.dayOfMonth || 0,
      run_time: config.time,
    };
  }

  const days = config.unit === "week" ? every * DAYS_PER_WEEK : every;
  return {
    cron_expr: "",
    interval_days: days,
    interval_months: 0,
    day_of_week: config.unit === "week" ? config.dayOfWeek || 0 : 0,
    day_of_month: 0,
    run_time: config.time,
  };
}

export function validateScheduleConfig(config: ScheduleConfig, t: TranslateFn): string | null {
  const every = Math.floor(config.every);
  if (!Number.isFinite(every) || every < 1) {
    return t("summary.schedule.config.everyMin");
  }
  if (config.unit === "month" && every > MAX_INTERVAL_MONTHS) {
    return t("summary.schedule.config.everyMaxMonths", {
      values: { max: MAX_INTERVAL_MONTHS },
    });
  }
  const days = config.unit === "week" ? every * DAYS_PER_WEEK : every;
  if (config.unit !== "month" && days > MAX_INTERVAL_DAYS) {
    return t("summary.schedule.config.everyMaxDays", {
      values: { max: MAX_INTERVAL_DAYS },
    });
  }
  return null;
}

export function describeScheduleConfig(config: ScheduleConfig, t: TranslateFn): string {
  const every = Math.max(1, Math.floor(config.every || 1));
  if (config.unit === "month") {
    const day =
      config.dayOfMonth && config.dayOfMonth > 0
        ? t("summary.cron.dayOfMonth", { values: { day: config.dayOfMonth } })
        : "";
    return t("summary.schedule.config.everyNMonthsAt", {
      values: { count: every, day, time: config.time },
    });
  }
  if (config.unit === "week") {
    const day =
      config.dayOfWeek && config.dayOfWeek > 0
        ? t(`summary.schedule.config.weekday.${weekdayKey(config.dayOfWeek)}`)
        : "";
    return t("summary.schedule.config.everyNWeeksAt", {
      values: { count: every, day, time: config.time },
    });
  }
  return t("summary.schedule.config.everyNDaysAt", {
    values: { count: every, time: config.time },
  });
}

function weekdayKey(day: number): string {
  return ["", "mon", "tue", "wed", "thu", "fri", "sat", "sun"][day] ?? "mon";
}
