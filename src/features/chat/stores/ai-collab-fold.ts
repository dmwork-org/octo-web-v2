import { Store } from "@tanstack/react-store";
import type { Channel } from "wukongimjssdk";

/**
 * AI 协作"折叠 session 预览"全局 store(对齐旧 dmworkbase
 * ConversationVM.foldSessionPreview static Map,vm.ts 行 89 + 行 444-453)。
 *
 * **角色**:当某个会话内有 active 的 AI 协作 fold session(多个 AI 参与的会话被
 * 折叠成单卡片),会话列表对应行 lastMessage 位用 "AI协作中 · 张三 × 李四 · 5条"
 * 替代普通 digest(对齐老仓 ConversationList lastContent 行 379-394
 * `wk-ai-collab-preview`)。
 *
 * **数据流**(老仓):
 *   - ConversationVM 计算 message renderItems 时,最后一项是 active foldSession →
 *     `ConversationVM.foldSessionPreview.set(channelKey, { participants, count })`
 *   - 不是 → `delete(channelKey)`
 *   - ConversationList 行渲染时直接读这个 cache
 *
 * **新仓状态**:AI 协作 module(fold session 消息类型 + ConversationVM 等价物)
 * 还没搬过来,所以 actions 暂无调用方。store + selector + 渲染层完整 wire,
 * AI module 接入后调一行 `chatAiCollabFoldActions.set(channel, ...)` 即生效。
 */

export interface AiCollabFoldPreview {
  participants: string[];
  count: number;
}

interface ChatAiCollabFoldState {
  map: ReadonlyMap<string, AiCollabFoldPreview>;
}

function channelKey(channel: Channel): string {
  return `${channel.channelID}_${channel.channelType}`;
}

export const chatAiCollabFoldStore = new Store<ChatAiCollabFoldState>({
  map: new Map(),
});

export const chatAiCollabFoldActions = {
  /** AI 协作 module 在 message renderItems 计算后调:有 active fold session → set */
  set(channel: Channel, preview: AiCollabFoldPreview): void {
    const key = channelKey(channel);
    chatAiCollabFoldStore.setState((s) => {
      const next = new Map(s.map);
      next.set(key, preview);
      return { map: next };
    });
  },
  /** 没有 active fold session(或会话切走)→ remove */
  remove(channel: Channel): void {
    const key = channelKey(channel);
    chatAiCollabFoldStore.setState((s) => {
      if (!s.map.has(key)) return s;
      const next = new Map(s.map);
      next.delete(key);
      return { map: next };
    });
  },
};

/** conversation-typing-digest 用的 selector — 返回 channel 对应 preview 或 undefined。 */
export function selectAiCollabFoldForChannel(channel: Channel) {
  const key = channelKey(channel);
  return (s: ChatAiCollabFoldState) => s.map.get(key);
}
