import { useSyncExternalStore, useMemo } from "react";
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
 * **引用稳定性**: 返回的 t 按 locale 记忆 —— 同一 locale 内引用稳定,只在切换
 * 语言时才返回新引用。这很重要: 若每次 render 都返回新函数(如直接
 * `i18n.t.bind(i18n)`),把 t 放进 useCallback/useMemo/useEffect 依赖的调用方会
 * 每次 render 都失效,极易触发 "Maximum update depth exceeded" 无限循环。
 * i18n.t 在调用时读取当前 locale,所以按 locale 绑定一次完全安全。
 *
 * 用法:
 *   const t = useT();
 *   return <div>{t("appbot.page.title")}</div>;
 */
export function useT(): (key: string, options?: TranslateOptions) => string {
  const locale = useSyncExternalStore(
    (cb) => i18n.subscribe(cb),
    () => i18n.getLocale(),
    () => i18n.getLocale(),
  );
  // 按 locale 记忆 t 引用: locale 不变则同一引用,切语言时才换新引用。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => i18n.t.bind(i18n), [locale]);
}
