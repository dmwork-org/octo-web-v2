import type { TranslateOptions } from "@/lib/i18n/types";
import type { ScheduleConfig } from "@/features/summary/types/summary.types";

const DAYS_PER_WEEK = 7;
const MAX_INTERVAL_DAYS = 3650;
const MAX_INTERVAL_MONTHS = 120;
const ISO_WEEKDAY_KEYS = ["", "mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

type TranslateFn = (key: string, options?: TranslateOptions) => string;

export function scheduleToParams(config: ScheduleConfig): {
  cron_expr: string;
  interval_days: number;
  interval_months: number;
  day_of_week: number;
  day_of_month: number;
  run_time: string;
  confirm_policy?: number;
} {
  const every = Math.max(1, Math.floor(config.every || 1));
  const confirmPolicy =
    config.confirm_policy !== undefined ? { confirm_policy: config.confirm_policy } : {};
  if (config.unit === "month") {
    return {
      cron_expr: "",
      interval_days: 0,
      interval_months: every,
      day_of_week: 0,
      day_of_month: config.dayOfMonth || 0,
      run_time: config.time,
      ...confirmPolicy,
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
    ...confirmPolicy,
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

export function scheduleItemToConfig(item: {
  cron_expr?: string;
  interval_days?: number;
  interval_months?: number;
  day_of_week?: number;
  day_of_month?: number;
  run_time?: string;
}): ScheduleConfig {
  if (item.interval_months && item.interval_months > 0) {
    return {
      unit: "month",
      every: item.interval_months,
      time: item.run_time || "09:00",
      dayOfMonth: item.day_of_month || 0,
    };
  }
  if (item.interval_days && item.interval_days > 0) {
    if (item.interval_days % DAYS_PER_WEEK === 0) {
      return {
        unit: "week",
        every: item.interval_days / DAYS_PER_WEEK,
        time: item.run_time || "09:00",
        dayOfWeek: item.day_of_week || 0,
      };
    }
    return { unit: "day", every: item.interval_days, time: item.run_time || "09:00" };
  }
  if (item.cron_expr) {
    return { unit: "day", every: 1, time: cronToTime(item.cron_expr), legacyCron: true };
  }
  return { unit: "week", every: 1, time: "09:00" };
}

export function describeSchedule(
  item: {
    cron_expr?: string;
    interval_days?: number;
    interval_months?: number;
    day_of_week?: number;
    day_of_month?: number;
    run_time?: string;
  },
  t: TranslateFn,
): string {
  const runTime = item.run_time || "";
  if (item.interval_months && item.interval_months > 0) {
    const config = scheduleItemToConfig(item);
    return describeScheduleConfig(config, t);
  }
  if (item.interval_days && item.interval_days > 0) {
    const config = scheduleItemToConfig(item);
    return describeScheduleConfig(config, t);
  }
  if (item.cron_expr) return describeCron(item.cron_expr, t);
  return runTime;
}

export function formatNextRunAt(value?: string | null): string {
  if (!value) return "—";
  const d = parseBackendTime(value);
  if (!d) return value;
  try {
    const parts = new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(d);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    const hour = get("hour") === "24" ? "00" : get("hour");
    return `${get("month")}/${get("day")} ${hour}:${get("minute")}`;
  } catch {
    return value;
  }
}

function weekdayKey(day: number): string {
  return ["", "mon", "tue", "wed", "thu", "fri", "sat", "sun"][day] ?? "mon";
}

function cronToTime(cronExpr: string): string {
  const parts = (cronExpr || "").trim().split(/\s+/);
  if (parts.length !== 5) return "09:00";
  const [minStr, hourStr] = parts;
  const hour = parseInt(hourStr, 10);
  const minute = parseInt(minStr, 10);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return "09:00";
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function describeCron(cronExpr: string, t: TranslateFn): string {
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length !== 5) return cronExpr;
  const [minStr, hourStr, dom, , dow] = parts;
  const timeStr = `${hourStr.padStart(2, "0")}:${minStr.padStart(2, "0")}`;
  if (dom !== "*") {
    return t("summary.schedule.cronEveryMonthOn", { values: { day: dom, time: timeStr } });
  }
  if (dow !== "*") {
    if (dow === "1-5") return t("summary.schedule.cronWorkdays", { values: { time: timeStr } });
    const n = parseInt(dow, 10);
    const key = Number.isFinite(n) ? ISO_WEEKDAY_KEYS[n] : "";
    const day = key ? t(`summary.cron.weekdays.${key}`) : dow;
    return t("summary.schedule.cronWeekly", { values: { day, time: timeStr } });
  }
  return t("summary.schedule.cronDaily", { values: { time: timeStr } });
}

function parseBackendTime(value: string): Date | null {
  const trimmed = value.trim();
  const hasTz = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(trimmed);
  let normalized = trimmed;
  if (!hasTz) {
    const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (match) {
      normalized = `${match[1]}T${match[2]}:${match[3]}:${match[4] || "00"}+08:00`;
    }
  }
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}
