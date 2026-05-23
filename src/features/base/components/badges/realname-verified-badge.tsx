interface RealnameVerifiedBadgeProps {
  /** "icon": 仅蓝勾;"tag": 仅"已实名"文字;"full": 并排展示(默认) */
  variant?: "icon" | "tag" | "full";
}

/**
 * OCTO 实名认证标识(对应旧 dmworkbase Components/RealnameVerifiedBadge):
 *
 * - 蓝色 ✓ 圆点 (#2f8cff) 12×12
 * - "已实名" tag 蓝底蓝字 12% 透明度
 * - variant: full(默认) / icon(仅勾) / tag(仅文字)
 *
 * 用于:个人资料页(full) / 聊天气泡 + 群成员列表(icon)。
 * 仍不用于:@mention / 联系人列表 / 已读列表 / 会话列表(避免噪音)。
 */
export function RealnameVerifiedBadge({ variant = "full" }: RealnameVerifiedBadgeProps) {
  const showIcon = variant !== "tag";
  const showText = variant !== "icon";
  return (
    <span
      className="ml-1.5 inline-flex shrink-0 items-center gap-[3px] text-[12px] font-medium leading-4 align-middle"
      style={{ color: "#2f8cff" }}
      title="已完成实名认证"
      aria-label="已实名"
      role="img"
    >
      {showIcon ? (
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          className="shrink-0"
          aria-hidden
        >
          <circle cx="6" cy="6" r="6" fill="currentColor" />
          <path
            d="M3 6.2l2 2 4-4"
            stroke="#fff"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      ) : null}
      {showText ? (
        <span
          className="h-4 rounded-[3px] px-[5px] text-[11px] font-medium leading-4 tracking-[0.02em]"
          style={{ background: "rgba(47, 140, 255, 0.12)", color: "#2f8cff" }}
        >
          已实名
        </span>
      ) : null}
    </span>
  );
}
