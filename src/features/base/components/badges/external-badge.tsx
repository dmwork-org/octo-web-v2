import { useT } from "@/lib/i18n/use-t";

interface ExternalBadgeProps {
  size?: "default" | "small";
}

/**
 * 外部成员标识 — 用于 @提及列表等场景区分内部/外部成员。
 *
 * 样式对齐 AiBadge 尺寸,强调高对比可读性:@提及列表里直接用更明确的
 * 紫底白字,避免浅底深字在复杂背景上发灰。
 */
export function ExternalBadge({ size = "default" }: ExternalBadgeProps) {
  const t = useT();
  const sizeCls =
    size === "small"
      ? "h-[14px] px-[3px] text-[10px] leading-[14px]"
      : "h-[16px] px-1 text-[12px] leading-[16px]";
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-[3px] bg-[#6D47D9] font-semibold tracking-[0.02em] text-white ${sizeCls}`}
    >
      {t("mentionList.external")}
    </span>
  );
}
