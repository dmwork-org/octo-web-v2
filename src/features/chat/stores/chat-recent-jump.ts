import { Store } from "@tanstack/react-store";

/**
 * Recent tab 重复点击 → 跳第一条未读 token(对齐上游 1f8c40a2)。
 *
 * 形态:递增 token。sidebar 检测到 recent tab 已 active + 有未读时 increment;
 * conversation-list 订阅到变化时找第一条 visible & unmuted unread 调 onSelect。
 *
 * 用 token 而非"目标 channelId"是因为:
 * - 触发与执行解耦,触发方不需知道目标
 * - 计算口径(unread+visible+unmuted)留给 list 自己,避免角标计算和导航口径分裂
 */
export interface ChatRecentJumpState {
  token: number;
}

export const chatRecentJumpStore = new Store<ChatRecentJumpState>({ token: 0 });

export const chatRecentJumpActions = {
  trigger() {
    chatRecentJumpStore.setState((s) => ({ token: s.token + 1 }));
  },
};
