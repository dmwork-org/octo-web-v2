import { Store } from "@tanstack/react-store";

/**
 * IM 连接状态(SDK 抽象 + 应用层语义)。
 *
 * 与 wukongimjssdk `ConnectStatus` 映射(`features/base/providers/im-provider.tsx`):
 *   SDK.Disconnect(0)  → "disconnected"(初始 / 主动断 / 网络抖)
 *   SDK.Connected(1)   → "connected"
 *   SDK.Connecting(2)  → "connecting"
 *   SDK.ConnectFail(3) → "failed"
 *   SDK.ConnectKick(4) → "kicked"(被踢)
 *
 * `idle` = IMProvider 尚未挂(未登录或刚登出)。
 *
 * UI 消费:顶栏 ConnectionBadge 读 status 显示绿/灰/红;Composer/MessageList 在
 * 非 connected 时显示 retry banner。
 */

export type ImConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "disconnected"
  | "failed"
  | "kicked";

export interface ImConnectionState {
  status: ImConnectionStatus;
  /** SDK 透传的 reasonCode(2 = auth fail) */
  reasonCode: number | null;
  /** 最近一次失败时的简短描述,用于 UI 提示 */
  lastError: string | null;
  /** SDK 自动重连次数(当前会话内累计) */
  reconnectAttempts: number;
}

const INITIAL: ImConnectionState = {
  status: "idle",
  reasonCode: null,
  lastError: null,
  reconnectAttempts: 0,
};

export const imConnectionStore = new Store<ImConnectionState>(INITIAL);

export const imConnectionActions = {
  setStatus: (status: ImConnectionStatus, reasonCode: number | null = null) =>
    imConnectionStore.setState((prev) => ({
      ...prev,
      status,
      reasonCode,
      reconnectAttempts:
        status === "connecting" ? prev.reconnectAttempts + 1 : prev.reconnectAttempts,
    })),
  setError: (lastError: string | null) =>
    imConnectionStore.setState((prev) => ({ ...prev, lastError })),
  reset: () => imConnectionStore.setState(() => INITIAL),
};
