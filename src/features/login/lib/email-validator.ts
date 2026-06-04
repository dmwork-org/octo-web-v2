/**
 * 邮箱格式校验(对齐老仓 dmworklogin/src/login.tsx `isValidEmail`)。
 *
 * 老仓正则:`^\S+@\S+\.\S+$` — 简单非空字符 + @ + . 结构,**不**做严格 RFC 5322。
 * 改进:用 `[^\s@]` 替换 `\S` 防 `@` 出现在 local-part(老仓代码不防,这里更严)。
 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
