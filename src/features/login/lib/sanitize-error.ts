import { t } from "@/lib/i18n/instance";

/**
 * 服务端错误消息白名单过滤(对齐老仓 dmworklogin/src/login.tsx `sanitizeErrorMessage`)。
 *
 * 防 information leakage:仅展示已知文案,unknown 走通用兜底;短而干净的消息直接透传。
 *
 * 关键字依旧用中文做 lookup(后端 raw msg 始终是中文),展示文案过 i18n。
 */

/** 后端 raw msg 中文 key → i18n display key 映射。lookup 走中文,展示过 i18n。 */
const KNOWN_ERROR_KEYS: Record<string, string> = {
  用户名或密码错误: "login.serverErrorDisplays.usernameOrPassword",
  验证码错误: "login.serverErrorDisplays.verificationCodeWrong",
  验证码已过期: "login.serverErrorDisplays.verificationCodeExpired",
  该邮箱已注册: "login.serverErrorDisplays.emailRegistered",
  该用户名已存在: "login.serverErrorDisplays.usernameExists",
  账号已被禁用: "login.serverErrorDisplays.accountDisabled",
  发送过于频繁: "login.serverErrorDisplays.sendTooOften",
};

/**
 * 把 raw 后端 msg 转成可展示文本。
 * - 已知 → 映射文案
 * - 短 + 无 HTML/stack 关键字 → 透传
 * - 其他 → fallback("操作失败,请稍后重试")
 */
export function sanitizeErrorMessage(msg: unknown): string {
  const fallback = t("login.validation.genericError");
  if (!msg || typeof msg !== "string") return fallback;
  const knownKey = KNOWN_ERROR_KEYS[msg];
  if (knownKey) return t(knownKey);
  if (msg.length <= 50 && !/[<>{}]|Error:|at /.test(msg)) {
    return msg;
  }
  return fallback;
}

/**
 * 从 ofetch 抛出的 error 里抽 `data.msg` / `data.message` / `message`,
 * 再走 `sanitizeErrorMessage` 白名单。统一所有 mutation onError 文案来源。
 */
export function extractSafeErrorMessage(err: unknown): string {
  if (!err || typeof err !== "object") return t("login.validation.genericError");
  const e = err as { data?: { msg?: unknown; message?: unknown }; message?: string };
  const raw = e.data?.msg ?? e.data?.message ?? e.message;
  return sanitizeErrorMessage(raw);
}
