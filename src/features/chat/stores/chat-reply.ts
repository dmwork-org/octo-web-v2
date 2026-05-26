import { Store } from "@tanstack/react-store";
import type { Channel, Message } from "wukongimjssdk";

/**
 * 回复上下文 store(per-channel,对应旧 ConversationVM.currentReplyMessage):
 *
 * - replies:Map<channelKey, Message>,key 是 `${channelID}_${channelType}`
 * - 用户右键"回复"选中的源消息按 channel 维度暂存;Composer 顶部 quoted bar 渲染
 *   时用 `useReplyForChannel(channel)` 取当前会话的 reply
 * - 发送时 MessageText.reply 由 Composer 自己读;成功后 chatReplyActions.clear(channel)
 *
 * 旧版 channel 切换会自动 clear reply,实测体验差(切走再切回 reply 没了)。
 * 本版改成持久化 — 每个会话独立保留自己的 reply 上下文,直到该会话发送成功 / 用户
 * 显式 ✕ 关掉。
 */

interface ChatReplyState {
  replies: Map<string, Message>;
}

function channelKey(channel: Channel): string {
  return `${channel.channelID}_${channel.channelType}`;
}

export const chatReplyStore = new Store<ChatReplyState>({ replies: new Map() });

export const chatReplyActions = {
  set: (channel: Channel, message: Message) =>
    chatReplyStore.setState((s) => {
      const next = new Map(s.replies);
      next.set(channelKey(channel), message);
      return { replies: next };
    }),

  clear: (channel: Channel) =>
    chatReplyStore.setState((s) => {
      if (!s.replies.has(channelKey(channel))) return s;
      const next = new Map(s.replies);
      next.delete(channelKey(channel));
      return { replies: next };
    }),
};

/** Composer / message-row 的 selector helper:取当前 channel 的 reply,无则 null。 */
export function selectReplyForChannel(
  state: ChatReplyState,
  channel: Channel | null,
): Message | null {
  if (!channel) return null;
  return state.replies.get(channelKey(channel)) ?? null;
}
