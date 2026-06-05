/**
 * AppBotIcon — 应用 menu icon(1:1 对齐老仓 dmworkappbot module.tsx::AppBotIcon)。
 * 视觉:2×2 圆角矩形网格(应用菜单常见样式)。激活态由父级 `text-brand` 切换 currentColor。
 */
export function AppBotIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect x="3" y="3" width="8" height="8" rx="2" />
      <rect x="13" y="3" width="8" height="8" rx="2" />
      <rect x="3" y="13" width="8" height="8" rx="2" />
      <rect x="13" y="13" width="8" height="8" rx="2" />
    </svg>
  );
}
