import { createContext } from "react";
import type { I18nFormatter } from "./format";
import { i18n } from "./instance";
import type { Locale } from "./types";

export interface I18nContextValue {
  format: I18nFormatter;
  locale: Locale;
  setLocale: (locale: string) => void;
  t: typeof i18n.t;
}

export const I18nContext = createContext<I18nContextValue>({
  format: i18n.format,
  locale: i18n.getLocale(),
  setLocale: (locale) => i18n.setLocale(locale),
  t: i18n.t.bind(i18n),
});
