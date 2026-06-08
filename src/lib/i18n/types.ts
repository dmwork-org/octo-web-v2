export const defaultLocale = "zh-CN" as const;

export const supportedLocales = ["zh-CN", "en-US"] as const;

export type Locale = (typeof supportedLocales)[number];

export type TextDirection = "ltr" | "rtl";

export type TranslationPrimitive = string | number | boolean | null | undefined | Date;

export type TranslationValues = Record<string, TranslationPrimitive>;

export type FlatMessages = Record<string, string>;

export type MessageTree = {
  [key: string]: string | MessageTree;
};

export type NamespaceResources = Partial<Record<Locale, MessageTree | FlatMessages>>;

export interface TranslateOptions {
  defaultValue?: string;
  locale?: Locale;
  values?: TranslationValues;
}

export interface I18nInitOptions {
  locale?: string;
  resources?: Record<string, NamespaceResources>;
}

export type I18nListener = (locale: Locale) => void;

export function isLocale(value: string | null | undefined): value is Locale {
  return supportedLocales.includes(value as Locale);
}

export function normalizeLocale(value: string | null | undefined): Locale | undefined {
  if (!value) return undefined;
  if (isLocale(value)) return value;

  const normalized = value.replace("_", "-").toLowerCase();
  if (normalized === "zh" || normalized.startsWith("zh-")) return "zh-CN";
  if (normalized === "en" || normalized.startsWith("en-")) return "en-US";
  return undefined;
}
