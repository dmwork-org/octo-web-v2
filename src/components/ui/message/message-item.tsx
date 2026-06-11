import { AlertCircle, AlertTriangle, CheckCircle2, Info, Loader2 } from "lucide-react";
import { dismiss } from "./store";
import type { MessageItem as MessageItemType, MessageType } from "./types";

/**
 * 单条 message 卡片 — 参考 antd message:
 *
 *   ┌──────────────────────────────────────────┐
 *   │  [icon]  文案内容       [action btn]?    │
 *   └──────────────────────────────────────────┘
 *
 * - 圆角 8px / 阴影 / 白底 / horizontal padding 16 / vertical 10
 * - 不带 X 关闭按钮(自动消失 / 长任务由调用方 dismiss)
 * - 图标 16px,跟文案 8px gap
 * - loading 类型图标用 lucide Loader2 + animate-spin
 * - 可选右侧 action 按钮(对齐 sonner action 用例:5s 撤销归档等),点击后自动 dismiss
 *
 * 视觉色彩(轻量,不抢眼):
 * - success:绿图标 + 白底(无背景填充,跟 antd 一致)
 * - error:红图标
 * - info:蓝图标
 * - warning:橙图标
 * - loading:灰图标 + 旋转
 */
const ICON_CONFIG: Record<
  MessageType,
  { Icon: typeof CheckCircle2; className: string; spin?: boolean }
> = {
  success: { Icon: CheckCircle2, className: "text-success" },
  error: { Icon: AlertCircle, className: "text-error" },
  info: { Icon: Info, className: "text-brand" },
  warning: { Icon: AlertTriangle, className: "text-warning" },
  loading: { Icon: Loader2, className: "text-text-tertiary", spin: true },
};

export function MessageItem({ item }: { item: MessageItemType }) {
  const { Icon, className, spin } = ICON_CONFIG[item.type];
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-auto flex items-center gap-2 rounded-lg border border-border-subtle bg-bg-surface px-4 py-2.5 text-[14px] leading-[1.4] text-text-primary shadow-md"
    >
      <Icon size={16} className={`shrink-0 ${className} ${spin ? "animate-spin" : ""}`} />
      <span className="min-w-0 break-words">{item.content}</span>
      {item.action ? (
        <button
          type="button"
          onClick={() => {
            item.action?.onClick();
            dismiss(item.id);
          }}
          className="ml-2 shrink-0 cursor-pointer rounded-md px-2 py-0.5 text-[13px] font-medium text-brand transition-colors hover:bg-brand-tint/40"
        >
          {item.action.label}
        </button>
      ) : null}
    </div>
  );
}
