import { useStore } from "@tanstack/react-store";
import { imConnectionStore, type ImConnectionStatus } from "@/features/base/stores/im-connection";

const STATUS_LABEL: Record<ImConnectionStatus, string> = {
  idle: "未连接",
  connecting: "连接中",
  connected: "已连接",
  disconnected: "已断开",
  failed: "连接失败",
  kicked: "在其他设备登录",
};

function dotClass(status: ImConnectionStatus): string {
  switch (status) {
    case "connected":
      return "bg-online";
    case "connecting":
      return "bg-warning animate-pulse";
    case "disconnected":
      return "bg-text-tertiary/60";
    case "failed":
    case "kicked":
      return "bg-error";
    case "idle":
    default:
      return "bg-text-disabled";
  }
}

/**
 * 顶/侧栏 IM 连接状态小圆点。读 imConnectionStore,纯显示。
 */
export function ConnectionBadge() {
  const status = useStore(imConnectionStore, (s) => s.status);
  const lastError = useStore(imConnectionStore, (s) => s.lastError);
  const tooltip = lastError ? `${STATUS_LABEL[status]} — ${lastError}` : STATUS_LABEL[status];
  return (
    <div
      role="status"
      aria-label={tooltip}
      title={tooltip}
      className="flex h-9 w-9 items-center justify-center"
    >
      <span className={`h-2 w-2 rounded-full ${dotClass(status)}`} />
    </div>
  );
}
