import { Store } from "@tanstack/react-store";
import type { Channel } from "wukongimjssdk";

/**
 * Chat 草稿全局 store(对齐旧 dmworkbase conversationWrap.remoteExtra.draft 角色):
 *
 * - 数据形态:`Map<channelKey, draftText>`,channelKey = `${channelID}_${channelType}`
 * - 真源:**store(内存)**;**同步双写 localStorage**(刷新恢复)
 * - 启动时把 localStorage 所有 `octo:chat:draft:*` 一次性 hydrate 到 store
 * - composer 用 `setDraft` / `removeDraft` 更新;conversation-list 用
 *   `selectDraftForChannel` 读 → 显 `[草稿]` 红色 label
 *
 * 老仓 `remoteExtra.draft` 走后端 conversationExtra(跨设备),新仓暂走 localStorage
 * (单设备),其他语义对齐(typing 时不显草稿、紧贴 lastMessage digest 前、红色)。
 */
const DRAFT_PREFIX = "octo:chat:draft:";

interface ChatDraftState {
  /** Map<channelKey, draftText> — 空字符串语义同无草稿(不进 map) */
  map: ReadonlyMap<string, string>;
}

function getChannelKey(channelID: string, channelType: number): string {
  return `${channelID}_${channelType}`;
}

function lsKey(channelKey: string): string {
  return `${DRAFT_PREFIX}${channelKey}`;
}

function hydrateFromLocalStorage(): Map<string, string> {
  const map = new Map<string, string>();
  if (typeof window === "undefined") return map;
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k || !k.startsWith(DRAFT_PREFIX)) continue;
      const v = window.localStorage.getItem(k);
      if (v && v.trim() !== "") {
        map.set(k.slice(DRAFT_PREFIX.length), v);
      }
    }
  } catch {
    // 私密模式 / quota 异常 — 静默
  }
  return map;
}

export const chatDraftStore = new Store<ChatDraftState>({
  map: hydrateFromLocalStorage(),
});

function writeLocalStorage(channelKey: string, text: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(lsKey(channelKey), text);
  } catch {
    // ignore
  }
}

function removeLocalStorage(channelKey: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(lsKey(channelKey));
  } catch {
    // ignore
  }
}

export const chatDraftActions = {
  set(channel: Channel, text: string): void {
    const key = getChannelKey(channel.channelID, channel.channelType);
    if (text.trim() === "") {
      chatDraftActions.remove(channel);
      return;
    }
    chatDraftStore.setState((s) => {
      const next = new Map(s.map);
      next.set(key, text);
      return { map: next };
    });
    writeLocalStorage(key, text);
  },
  remove(channel: Channel): void {
    const key = getChannelKey(channel.channelID, channel.channelType);
    chatDraftStore.setState((s) => {
      if (!s.map.has(key)) return s;
      const next = new Map(s.map);
      next.delete(key);
      return { map: next };
    });
    removeLocalStorage(key);
  },
  get(channel: Channel): string | undefined {
    const key = getChannelKey(channel.channelID, channel.channelType);
    return chatDraftStore.state.map.get(key);
  },
};

/** conversation-list / typing-digest 用的 selector — 返回 channel 对应草稿文本或 undefined。 */
export function selectDraftForChannel(channel: Channel) {
  const key = getChannelKey(channel.channelID, channel.channelType);
  return (s: ChatDraftState) => s.map.get(key);
}
