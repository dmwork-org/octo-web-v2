interface MuteIconProps {
  size?: number;
  className?: string;
}

/**
 * 免打扰图标(1:1 复刻老仓 .wk-conv-mute-icon SVG path):
 * 实心铃铛被左下斜线划掉的造型,viewBox 1131×1024,默认 11×11。
 *
 * 跟 lucide BellOff 视觉差异较大(那是线条铃铛 + 斜线),老仓是实心 + 自带斜线裁切。
 * 用于会话列表行 / 头像菜单 / channel header 等所有"免打扰"提示位。
 */
export function MuteIcon({ size = 11, className }: MuteIconProps) {
  return (
    <svg
      viewBox="0 0 1131 1024"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M914.688 892.736L64 236.224l38.784-50.88L271.36 315.648a300.288 300.288 0 0 1 246.976-157.952v-33.28c0-16.64 13.504-30.08 30.08-30.08h2.304c16.576 0 30.08 13.44 30.08 30.08v32.96a299.776 299.776 0 0 1 284.928 299.136v294.272l45.504 58.624 48.768 37.696-45.312 45.632zM234.624 480.384l506.88 391.232H140.416l94.272-121.536-0.064-269.696z" />
    </svg>
  );
}
