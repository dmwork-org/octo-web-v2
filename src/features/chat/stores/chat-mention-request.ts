import { Store } from "@tanstack/react-store";
import type { Channel } from "wukongimjssdk";

/**
 * 头像菜单 "@TA" 请求 store(per-channel):
 *
 * - 头像 popover 点 "@TA" → `chatMentionRequestActions.request(channel, { uid, label })`
 * - Composer 用命名 hook `useApplyPendingMention(channel)` 监听本 store,
 *   pending 不为空 → editor.insertContent mention node + chatMentionRequestActions.consume
 *
 * `nonce` 单调递增,保证同一 uid 多次请求(用户连续点同一头像)都能触发 effect —
 * 否则 store value 引用相同 useEffect 不重跑。
 *
 * 对齐旧 ConversationContext:
 *   onTapAvatar → avatarMenusContext.show → "@TA" menu item →
 *   `this.messageInputContext()?.addMention(uid, name)`
 */

export interface MentionRequest {
  uid: string;
  label: string;
  nonce: number;
}

interface ChatMentionRequestState {
  pending: Map<string, MentionRequest>;
}

function channelKey(channel: Channel): string {
  return `${channel.channelID}_${channel.channelType}`;
}

let nonceCounter = 0;

export const chatMentionRequestStore = new Store<ChatMentionRequestState>({
  pending: new Map(),
});

export const chatMentionRequestActions = {
  request: (channel: Channel, target: { uid: string; label: string }) =>
    chatMentionRequestStore.setState((s) => {
      const next = new Map(s.pending);
      next.set(channelKey(channel), {
        uid: target.uid,
        label: target.label,
        nonce: ++nonceCounter,
      });
      return { pending: next };
    }),

  consume: (channel: Channel) =>
    chatMentionRequestStore.setState((s) => {
      const key = channelKey(channel);
      if (!s.pending.has(key)) return s;
      const next = new Map(s.pending);
      next.delete(key);
      return { pending: next };
    }),
};

/** Composer / message-row 的 selector helper:取当前 channel 的 pending,无则 null。 */
export function selectPendingMention(
  state: ChatMentionRequestState,
  channel: Channel | null,
): MentionRequest | null {
  if (!channel) return null;
  return state.pending.get(channelKey(channel)) ?? null;
}
