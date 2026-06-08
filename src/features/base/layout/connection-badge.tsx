import { useStore } from "@tanstack/react-store";
import { useT } from "@/lib/i18n/use-t";
import { imConnectionStore, type ImConnectionStatus } from "@/features/base/stores/im-connection";

const STATUS_LABEL_KEY: Record<ImConnectionStatus, string> = {
  idle: "base.connection.idle",
  connecting: "base.connection.connecting",
  connected: "base.connection.connected",
  disconnected: "base.connection.disconnected",
  failed: "base.connection.failed",
  kicked: "base.connection.kicked",
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
  const t = useT();
  const status = useStore(imConnectionStore, (s) => s.status);
  const lastError = useStore(imConnectionStore, (s) => s.lastError);
  const label = t(STATUS_LABEL_KEY[status]);
  const tooltip = lastError ? `${label} — ${lastError}` : label;
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
