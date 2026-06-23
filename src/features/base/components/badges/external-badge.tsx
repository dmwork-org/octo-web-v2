import { useT } from "@/lib/i18n/use-t";

interface ExternalBadgeProps {
  size?: "default" | "small";
}

/**
 * 外部成员标识 — 用于 @提及列表等场景区分内部/外部成员。
 *
 * 样式对齐 AiBadge 尺寸,使用 brand-tint 背景 + text-secondary 文字
 * (与 follow-list 的「外部」标签风格一致)。
 */
export function ExternalBadge({ size = "default" }: ExternalBadgeProps) {
  const t = useT();
  const sizeCls =
    size === "small"
      ? "h-[14px] px-[3px] text-[10px] leading-[14px]"
      : "h-[16px] px-1 text-[12px] leading-[16px]";
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-[3px] font-semibold tracking-[0.02em] bg-brand-tint text-text-secondary ${sizeCls}`}
    >
      {t("mentionList.external")}
    </span>
  );
}
