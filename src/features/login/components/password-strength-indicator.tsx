/**
 * 密码强度指示器(注册 + 找回密码 公用)。
 *
 * 简化老仓评分逻辑,只看 4 项加分:
 *   - 长度 >= 8 / 12 / 16
 *   - 含小写
 *   - 含大写 或 数字
 *   - 含特殊字符
 *
 * 强度三档:weak(<2)/ medium(2-3)/ strong(4+)。空密码不显示。
 */

interface PasswordStrengthIndicatorProps {
  password: string;
}

function score(password: string): number {
  if (!password) return 0;
  let s = 0;
  if (password.length >= 8) s++;
  if (password.length >= 12) s++;
  if (/[a-z]/.test(password) && (/[A-Z]/.test(password) || /\d/.test(password))) s++;
  if (/[^A-Za-z0-9]/.test(password)) s++;
  return s;
}

export function PasswordStrengthIndicator({ password }: PasswordStrengthIndicatorProps) {
  if (!password) return null;
  const s = score(password);
  const level = s >= 4 ? "strong" : s >= 2 ? "medium" : "weak";
  const label = level === "strong" ? "强" : level === "medium" ? "中" : "弱";
  const colorClass =
    level === "strong" ? "bg-success" : level === "medium" ? "bg-warning" : "bg-error";
  const widthClass = level === "strong" ? "w-full" : level === "medium" ? "w-2/3" : "w-1/3";

  return (
    <div className="flex items-center gap-2">
      <div className="h-1 flex-1 overflow-hidden rounded bg-bg-elevated">
        <div className={`h-full ${colorClass} ${widthClass}`} />
      </div>
      <span className="text-[11px] text-text-tertiary">强度:{label}</span>
    </div>
  );
}
