import type { I18nFormatter } from "@/lib/i18n/format";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

export function formatRelativeFromNow(value: string | null | undefined, format: I18nFormatter) {
  if (!value) return "";
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return String(value);
  const diff = time - Date.now();
  const abs = Math.abs(diff);
  if (abs < HOUR) return format.relativeTime(Math.round(diff / MINUTE), "minute");
  if (abs < DAY) return format.relativeTime(Math.round(diff / HOUR), "hour");
  if (abs < MONTH) return format.relativeTime(Math.round(diff / DAY), "day");
  if (abs < YEAR) return format.relativeTime(Math.round(diff / MONTH), "month");
  return format.relativeTime(Math.round(diff / YEAR), "year");
}
