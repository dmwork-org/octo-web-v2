import { dismiss, dismissAll, show } from "./store";
import type { MessageOptions } from "./types";

/**
 * 全局 Message 公共 API(参考 antd message,本仓自家实现 — sonner 已下线)。
 *
 * 用法:
 *   import { message } from "@/components/ui/message";
 *   message.success("已离开子区");
 *   message.error("网络异常,请稍后再试", { key: "net-error" }); // 同 key 去重
 *   const id = message.loading("上传中..."); // loading 不自动消失
 *   message.dismiss(id);  // 或 message.dismiss("net-error")
 *
 * **去重语义**:`opts.key` 相同时复用现有条目(更新 content + 重置 timer);
 * 多个无 key 调用各自独立堆叠。
 *
 * 业务代码直接 import `message`,统一使用本模块作为提示 API。
 */
export const message = {
  success: (content: string, opts?: MessageOptions) => show("success", content, opts),
  error: (content: string, opts?: MessageOptions) => show("error", content, opts),
  info: (content: string, opts?: MessageOptions) => show("info", content, opts),
  warning: (content: string, opts?: MessageOptions) => show("warning", content, opts),
  /** loading 默认 duration=0(不自动消失),返回 id 供后续 dismiss。 */
  loading: (content: string, opts?: MessageOptions) => show("loading", content, opts),
  /** 关闭指定 id(number)或 key(string)的 message。 */
  dismiss: (idOrKey: number | string) => dismiss(idOrKey),
  /** 清掉所有 message(罕用)。 */
  dismissAll,
};
