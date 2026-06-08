import type { TranslateOptions } from "./types";
import { I18nService } from "./i18n-service";
import enUS from "./locales/en-US.json";
import zhCN from "./locales/zh-CN.json";

export const i18n = new I18nService();

// 用空 namespace —— locale 文件已合并上游多套(appbot/contacts/login/summary/matter/web 等)
// 各自带 namespace 前缀(如 "contacts.search.placeholder"),业务调用 `t("contacts.search.placeholder")`
// 直接命中。不再加 "base." 包装,跟调用方习惯对齐。
i18n.registerNamespace("", {
  "zh-CN": zhCN,
  "en-US": enUS,
});
i18n.init();

export function t(key: string, options?: TranslateOptions) {
  return i18n.t(key, options);
}
