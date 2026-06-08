import { t } from "@/lib/i18n/instance";

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

/** 5 档颜色固定;label 在每次评估时取 i18n(避免 module load 时 locale 未稳)。 */
const STRENGTH_COLORS: readonly string[] = ["#ff4d4f", "#ff7a45", "#faad14", "#52c41a", "#389e0d"];

const STRENGTH_LABEL_KEYS = [
  "login.password.levels.veryWeak",
  "login.password.levels.weak",
  "login.password.levels.fair",
  "login.password.levels.strong",
  "login.password.levels.veryStrong",
] as const;

/** 返回错误字符串(无效)或 null(有效)。对齐老仓 `validatePassword`。 */
export function validatePassword(pwd: string): string | null {
  if (!pwd) return t("login.password.required");
  if (pwd.length < MIN_PASSWORD_LENGTH) {
    return t("login.password.lengthMin", { values: { count: MIN_PASSWORD_LENGTH } });
  }
  const r = evaluatePasswordStrength(pwd);
  if (r.score < 2) return t("login.password.tooWeak");
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
  const label = t(STRENGTH_LABEL_KEYS[score]);
  const color = STRENGTH_COLORS[score];
  const feedback: string[] = [];
  if (!isValid)
    feedback.push(t("login.password.lengthMin", { values: { count: MIN_PASSWORD_LENGTH } }));
  else if (score < 2) feedback.push(t("login.password.feedbackBasic.weak"));
  else if (score < 4) feedback.push(t("login.password.feedbackBasic.medium"));

  return { score, label, color, isValid, feedback };
}
