import { evaluatePasswordStrength } from "@/features/login/lib/password-strength";

interface PasswordStrengthMeterProps {
  password: string;
}

/**
 * 密码强度指示器(对齐老仓 PasswordStrengthIndicator.tsx):
 *
 * - 5 段进度条(对应 score 0-4),当前 score 之前的段用 strength.color,之后灰色
 * - 标签行:`密码强度: {label}`,颜色用 strength.color
 * - 反馈文字:最多 1 条(老仓也是),12px 灰色
 * - 空密码不渲染(对齐老仓 if (!password) return null)
 */
export function PasswordStrengthMeter({ password }: PasswordStrengthMeterProps) {
  if (!password) return null;
  const r = evaluatePasswordStrength(password);
  return (
    <div className="mb-3 flex flex-col gap-1.5">
      <div className="flex gap-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-1 flex-1 rounded-[2px] transition-colors"
            style={{ backgroundColor: i <= r.score ? r.color : "#e4e6ef" }}
          />
        ))}
      </div>
      <div className="flex items-center gap-2 text-[12px]">
        <span style={{ color: r.color }}>密码强度: {r.label}</span>
        {r.feedback[0] ? <span className="text-[#8a8fa8]">· {r.feedback[0]}</span> : null}
      </div>
    </div>
  );
}
