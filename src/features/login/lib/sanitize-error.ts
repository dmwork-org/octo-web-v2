/**
 * 服务端错误消息白名单过滤(对齐老仓 dmworklogin/src/login.tsx `sanitizeErrorMessage`)。
 *
 * 防 information leakage:仅展示已知文案,unknown 走通用兜底;短而干净的消息直接透传。
 */

const KNOWN_ERROR_MESSAGES: Record<string, string> = {
  用户名或密码错误: "用户名或密码错误",
  验证码错误: "验证码错误",
  验证码已过期: "验证码已过期",
  该邮箱已注册: "该邮箱已注册",
  该用户名已存在: "该用户名已存在",
  账号已被禁用: "账号已被禁用",
  发送过于频繁: "发送过于频繁，请稍后再试",
};

const FALLBACK = "操作失败，请稍后重试";

/**
 * 把 raw 后端 msg 转成可展示文本。
 * - 已知 → 映射文案
 * - 短 + 无 HTML/stack 关键字 → 透传
 * - 其他 → fallback("操作失败,请稍后重试")
 */
export function sanitizeErrorMessage(msg: unknown): string {
  if (!msg || typeof msg !== "string") return FALLBACK;
  const known = KNOWN_ERROR_MESSAGES[msg];
  if (known) return known;
  if (msg.length <= 50 && !/[<>{}]|Error:|at /.test(msg)) {
    return msg;
  }
  return FALLBACK;
}

/**
 * 从 ofetch 抛出的 error 里抽 `data.msg` / `data.message` / `message`,
 * 再走 `sanitizeErrorMessage` 白名单。统一所有 mutation onError 文案来源。
 */
export function extractSafeErrorMessage(err: unknown): string {
  if (!err || typeof err !== "object") return FALLBACK;
  const e = err as { data?: { msg?: unknown; message?: unknown }; message?: string };
  const raw = e.data?.msg ?? e.data?.message ?? e.message;
  return sanitizeErrorMessage(raw);
}
