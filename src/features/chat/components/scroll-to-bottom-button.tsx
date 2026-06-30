import { ChevronDown, Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n/use-t";

interface ScrollToBottomButtonProps {
  visible: boolean;
  unreadCount: number;
  loading?: boolean;
  onClick: () => void;
}

export function ScrollToBottomButton({
  visible,
  unreadCount,
  loading,
  onClick,
}: ScrollToBottomButtonProps) {
  const t = useT();
  if (!visible) return null;
  const badgeText = unreadCount > 99 ? "99+" : String(unreadCount);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      aria-label={
        unreadCount > 0
          ? t("scrollToBottom.unreadAria", { values: { count: unreadCount } })
          : t("scrollToBottom.backToBottom")
      }
      title={
        unreadCount > 0
          ? t("scrollToBottom.unreadTitle", { values: { count: unreadCount } })
          : t("scrollToBottom.backToBottom")
      }
      className="absolute right-6 bottom-4 z-floating flex h-[50px] w-[50px] cursor-pointer items-center justify-center rounded-full bg-white text-text-secondary shadow-sm transition-colors hover:bg-bg-elevated hover:text-text-primary disabled:cursor-wait disabled:opacity-80"
    >
      {loading ? <Loader2 size={20} className="animate-spin" /> : <ChevronDown size={20} />}
      {unreadCount > 0 ? (
        <span className="absolute -top-1 -right-1 flex h-6 min-w-6 items-center justify-center rounded-xl bg-error px-1.5 text-sm leading-6 font-medium text-white">
          {badgeText}
        </span>
      ) : null}
    </button>
  );
}
