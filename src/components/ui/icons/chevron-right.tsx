/**
 * ChevronRightIcon — 行尾箭头(用于"加入新Space"等导航行 trailing)。
 * 简单 stroke chevron,跟 lucide ChevronRight 视觉一致,内联避免依赖。
 */
export function ChevronRightIcon({ size = 14 }: { size?: number }) {
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
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}
