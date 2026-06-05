import { ChevronDown } from "lucide-react";

interface ScrollToBottomButtonProps {
  visible: boolean;
  unreadCount: number;
  onClick: () => void;
}

/**
 * 消息列表右下角悬浮按钮(1:1 对齐旧 .wk-conversationpositionview + .wk-conversationpositionview-item):
 *
 * **容器**:`absolute right-6 bottom-4 z-[100]`(对齐旧 1.5rem / 1rem / z 100)
 *
 * **按钮**:
 *   - 50×50 圆形 白底 + shadow-sm
 *   - 内嵌 20×20 ChevronDown 灰箭头
 *
 * **未读徽标**(对齐旧 .wk-conversation-unread-count):
 *   - min-w 24 / h 24 / padding 0 6px(`px-1.5`)/ rounded 12px(`rounded-xl`)
 *   - 红底 white 字 14px font-medium / line-height 24
 *   - absolute -top-1 -right-1(≈ -0.3rem)
 *   - >99 显示 "99+"
 *
 * **不可见时不渲染**(避免占用 hit area)。
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
      className="absolute right-6 bottom-4 z-floating flex h-[50px] w-[50px] cursor-pointer items-center justify-center rounded-full bg-white text-text-secondary shadow-sm transition-colors hover:bg-bg-elevated hover:text-text-primary"
    >
      <ChevronDown size={20} />
      {unreadCount > 0 ? (
        <span className="absolute -top-1 -right-1 flex h-6 min-w-6 items-center justify-center rounded-xl bg-error px-1.5 text-sm leading-6 font-medium text-white">
          {badgeText}
        </span>
      ) : null}
    </button>
  );
}
