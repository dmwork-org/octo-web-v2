/**
 * 密码强度评估(对齐老仓 dmworklogin/src/passwordStrength.ts):
 *
 * - `MIN_PASSWORD_LENGTH = 6`(老仓最小长度)
 * - `validatePassword(pwd)` 返回错误字符串 / null(有效)
 * - `evaluatePasswordStrength(pwd)` 返回 5 档 { score 0-4, label, color, isValid, feedback[] }
 *
 * 简化版:不引 zxcvbn(老仓引,但 ~400KB);用规则评分:
 * - 长度 ≥ 6 / 8 / 12 / 16 各加分
 * - 含大小写 / 数字 / 特殊字符 各加分
 * - cap 到 4
 */

export const MIN_PASSWORD_LENGTH = 6;

export interface PasswordStrengthResult {
  /** 0-4(对齐老仓 5 档:非常弱 / 弱 / 一般 / 强 / 非常强)。 */
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  color: string;
  isValid: boolean;
  feedback: string[];
}

const STRENGTH_TABLE: Array<{ label: string; color: string }> = [
  { label: "非常弱", color: "#ff4d4f" },
  { label: "弱", color: "#ff7a45" },
  { label: "一般", color: "#faad14" },
  { label: "强", color: "#52c41a" },
  { label: "非常强", color: "#389e0d" },
];

/** 返回错误字符串(无效)或 null(有效)。对齐老仓 `validatePassword`。 */
export function validatePassword(pwd: string): string | null {
  if (!pwd) return "密码不能为空";
  if (pwd.length < MIN_PASSWORD_LENGTH) {
    return `密码长度至少需要 ${MIN_PASSWORD_LENGTH} 位`;
  }
  const r = evaluatePasswordStrength(pwd);
  if (r.score < 2) return "密码强度太弱，请设置更安全的密码";
  return null;
}

export function evaluatePasswordStrength(pwd: string): PasswordStrengthResult {
  const isValid = pwd.length >= MIN_PASSWORD_LENGTH;
  let raw = 0;
  if (pwd.length >= 6) raw++;
  if (pwd.length >= 12) raw++;
  if (pwd.length >= 16) raw++;
  if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) raw++;
  if (/\d/.test(pwd)) raw++;
  if (/[^A-Za-z0-9]/.test(pwd)) raw++;

  const score = (isValid ? Math.min(raw, 4) : 0) as 0 | 1 | 2 | 3 | 4;
  const meta = STRENGTH_TABLE[score];
  const feedback: string[] = [];
  if (!isValid) feedback.push(`密码长度至少需要 ${MIN_PASSWORD_LENGTH} 位`);
  else if (score < 2) feedback.push("建议加入大小写字母、数字和特殊字符");
  else if (score < 4) feedback.push("可加入更多字符类型让密码更强");

  return { score, label: meta.label, color: meta.color, isValid, feedback };
}
