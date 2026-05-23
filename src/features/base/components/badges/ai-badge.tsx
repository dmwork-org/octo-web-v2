interface AiBadgeProps {
  size?: "default" | "small";
}

/**
 * AI bot 标识(对应旧 dmworkbase Components/AiBadge):
 *
 * 紫色 gradient(#7B89F4 → #9D78F5),白字 "AI",3px 圆角,16/14px 高度。
 * Tailwind 写 inline style 保 gradient 精确(对齐 Figma)。
 */
export function AiBadge({ size = "default" }: AiBadgeProps) {
  const sizeCls =
    size === "small"
      ? "h-[14px] px-[3px] text-[10px] leading-[14px]"
      : "h-[16px] px-1 text-[12px] leading-[16px]";
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-[3px] font-semibold tracking-[0.02em] text-white ${sizeCls}`}
      style={{ background: "linear-gradient(90deg, #7B89F4 0%, #9D78F5 100%)" }}
    >
      AI
    </span>
  );
}
