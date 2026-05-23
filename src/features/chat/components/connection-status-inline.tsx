import { useStore } from "@tanstack/react-store";
import { imConnectionStore, type ImConnectionStatus } from "@/features/base/stores/im-connection";

const STATUS_TEXT: Record<ImConnectionStatus, string> = {
  idle: "未连接",
  connecting: "连接中…",
  connected: "已连接",
  disconnected: "已断开",
  failed: "连接失败",
  kicked: "被踢下线",
};

function dotColor(s: ImConnectionStatus): string {
  switch (s) {
    case "connected":
      return "bg-online";
    case "connecting":
      return "bg-warning animate-pulse";
    case "failed":
    case "kicked":
      return "bg-error";
    default:
      return "bg-text-tertiary/60";
  }
}

/** sidebar 顶部连接状态文字标签(对应旧 NavSignalBadge showText)。 */
export function ConnectionStatusInline() {
  const status = useStore(imConnectionStore, (s) => s.status);
  const text = STATUS_TEXT[status];
  if (status === "connected") return null; // 正常时不打扰
  return (
    <span
      role="status"
      className="inline-flex items-center gap-1 text-[11px] leading-none text-text-tertiary"
    >
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${dotColor(status)}`} />
      {text}
    </span>
  );
}
