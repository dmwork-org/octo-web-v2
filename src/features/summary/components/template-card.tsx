import { Calendar, FileText, ListChecks, MessageSquare, type LucideIcon } from "lucide-react";
import type { TopicTemplate } from "@/features/summary/types/summary.types";

/**
 * topic 模板字符串 → lucide icon 组件映射(对齐老仓 TemplateCard ICON_MAP)。
 * 后端模板的 `icon` 字段是字符串名,前端取一组固定 icon set 渲染。
 * 不在 map 内时不渲染 icon(防止 UI 炸)。
 */
const ICON_MAP: Record<string, LucideIcon> = {
  FileText,
  ListChecks,
  Calendar,
  MessageSquare,
};

interface TemplateCardProps {
  template: TopicTemplate;
  onClick: (template: TopicTemplate) => void;
}

/**
 * 模板卡片(chat-summary-new-modal 输入框为空时显示一组建议主题)。
 *
 * UI:本仓 tailwind + design tokens,跟 chat-header / settings-flyout 同款 hover/border。
 */
export function TemplateCard({ template, onClick }: TemplateCardProps) {
  const Icon = ICON_MAP[template.icon];
  return (
    <button
      type="button"
      onClick={() => onClick(template)}
      className="flex min-w-0 flex-1 cursor-pointer flex-col items-start gap-2 rounded-lg border border-border-default bg-bg-surface p-3 text-left transition-colors hover:border-brand hover:bg-brand-tint/40 focus:outline-none"
    >
      {Icon ? <Icon size={20} className="text-text-secondary" /> : null}
      <div className="text-[13px] font-semibold text-text-primary">{template.label}</div>
      <div className="text-xs leading-4 text-text-tertiary">{template.description}</div>
    </button>
  );
}
