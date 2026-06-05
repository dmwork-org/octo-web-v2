/**
 * MatterIcon — 事项 menu icon(1:1 对齐老仓 dmworktodo module.tsx::MatterIcon)。
 * 视觉:对勾 + 折叠角矩形 outline(stroke 模式)。激活态由父级 `text-brand` 切换 currentColor。
 */
export function MatterIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
    </svg>
  );
}
