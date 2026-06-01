import { ChevronDown } from "lucide-react";

interface ScrollToBottomButtonProps {
  visible: boolean;
  unreadCount: number;
  onClick: () => void;
}

/**
 * 消息列表右下角悬浮按钮(1:1 对齐旧 wk-conversationpositionview-item):
 *   - 圆形 36×36 白底 + 阴影(shadow-md)+ 灰色向下箭头(ChevronDown 18)
 *   - 未读 ≥ 1 时按钮右上角红色徽标(>99 显示 "99+")
 *   - 不可见时不渲染(避免占用 hit area)
 *
 * **定位**:absolute right-4 bottom-4 — message-list 外层 relative wrapper 内,
 * 不被 scroll 容器跟着滚。
 */
export function ScrollToBottomButton({ visible, unreadCount, onClick }: ScrollToBottomButtonProps) {
  if (!visible) return null;
  const badgeText = unreadCount > 99 ? "99+" : String(unreadCount);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={unreadCount > 0 ? `${unreadCount} 条新消息,回到底部` : "回到底部"}
      title={unreadCount > 0 ? `${unreadCount} 条新消息` : "回到底部"}
      className="absolute right-4 bottom-4 z-10 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-white text-text-secondary shadow-md transition-colors hover:bg-bg-elevated hover:text-text-primary"
    >
      <ChevronDown size={18} />
      {unreadCount > 0 ? (
        <span className="absolute -top-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-error px-1 text-[11px] leading-none font-semibold text-white">
          {badgeText}
        </span>
      ) : null}
    </button>
  );
}
