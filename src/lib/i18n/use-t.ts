import { useSyncExternalStore } from "react";
import { i18n } from "./instance";
import type { TranslateOptions } from "./types";

/**
 * 在组件内用 `useT()` 拿 t — 切语言会触发 component re-render。
 *
 * 跟 `import { t } from "./instance"` 直接调用相比:
 * - 直接 import 的 t() 只能拿到 first render 时的 locale,locale 切换后已 mounted
 *   组件不会自动重渲染(因为它没 subscribe locale)
 * - useT() 通过 useSyncExternalStore 订阅 i18n.subscribe,locale 一变所有用 useT
 *   的组件即时 re-render,文案立刻刷新
 *
 * 用法:
 *   const t = useT();
 *   return <div>{t("appbot.page.title")}</div>;
 */
export function useT(): (key: string, options?: TranslateOptions) => string {
  useSyncExternalStore(
    (cb) => i18n.subscribe(cb),
    () => i18n.getLocale(),
    () => i18n.getLocale(),
  );
  return i18n.t.bind(i18n);
}
