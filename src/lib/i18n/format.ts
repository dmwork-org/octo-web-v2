import type { Locale } from "./types";

export type DateInput = Date | number | string;

export type RelativeTimeUnit =
  | "second"
  | "minute"
  | "hour"
  | "day"
  | "week"
  | "month"
  | "quarter"
  | "year";

export interface I18nFormatter {
  currency(value: number, currency: string, options?: Intl.NumberFormatOptions): string;
  date(value: DateInput, options?: Intl.DateTimeFormatOptions): string;
  dateTime(value: DateInput, options?: Intl.DateTimeFormatOptions): string;
  number(value: number, options?: Intl.NumberFormatOptions): string;
  relativeTime(value: number, unit?: RelativeTimeUnit): string;
  time(value: DateInput, options?: Intl.DateTimeFormatOptions): string;
}

function toDate(value: DateInput): Date {
  return value instanceof Date ? value : new Date(value);
}

function formatDate(locale: Locale, value: DateInput, options: Intl.DateTimeFormatOptions) {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(locale, options).format(date);
}

const granularDateTimeOptions: Array<keyof Intl.DateTimeFormatOptions> = [
  "day",
  "dayPeriod",
  "era",
  "fractionalSecondDigits",
  "hour",
  "minute",
  "month",
  "second",
  "timeZoneName",
  "weekday",
  "year",
];

function withDefaultDateTimeOptions(
  defaults: Intl.DateTimeFormatOptions,
  options?: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormatOptions {
  if (!options) return defaults;
  const hasGranularOptions = granularDateTimeOptions.some((key) => options[key] !== undefined);
  if (hasGranularOptions) return options;
  return {
    ...defaults,
    ...options,
  };
}

export function createI18nFormatter(locale: Locale): I18nFormatter {
  return {
    currency(value, currency, options) {
      return new Intl.NumberFormat(locale, {
        currency,
        style: "currency",
        ...options,
      }).format(value);
    },
    date(value, options) {
      return formatDate(
        locale,
        value,
        withDefaultDateTimeOptions(
          {
            dateStyle: "medium",
          },
          options,
        ),
      );
    },
    dateTime(value, options) {
      return formatDate(
        locale,
        value,
        withDefaultDateTimeOptions(
          {
            dateStyle: "medium",
            timeStyle: "short",
          },
          options,
        ),
      );
    },
    number(value, options) {
      return new Intl.NumberFormat(locale, options).format(value);
    },
    relativeTime(value, unit = "day") {
      if (typeof Intl.RelativeTimeFormat === "undefined") {
        return `${value} ${unit}`;
      }
      return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(value, unit);
    },
    time(value, options) {
      return formatDate(
        locale,
        value,
        withDefaultDateTimeOptions(
          {
            timeStyle: "short",
          },
          options,
        ),
      );
    },
  };
}
