import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { I18nContext, type I18nContextValue } from "./i18n-context";
import { createI18nFormatter } from "./format";
import { i18n } from "./instance";
import type { Locale } from "./types";

function useLocaleSubscription(): Locale {
  const [locale, setLocale] = useState<Locale>(i18n.getLocale());
  useEffect(() => i18n.subscribe(setLocale), []);
  return locale;
}

export interface I18nProviderProps {
  children: ReactNode;
}

export function I18nProvider({ children }: I18nProviderProps) {
  const locale = useLocaleSubscription();
  const value = useMemo<I18nContextValue>(
    () => ({
      format: createI18nFormatter(locale),
      locale,
      setLocale: (nextLocale) => i18n.setLocale(nextLocale),
      t: i18n.t.bind(i18n),
    }),
    [locale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
