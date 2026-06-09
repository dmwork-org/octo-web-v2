import { Store } from "@tanstack/react-store";
import type { ConvTab } from "@/features/chat/components/conversation-list";

/**
 * Chat sidebar 「关注」/「最近」tab 状态持久化。
 *
 * 用户切换 tab → 保存到 localStorage → 刷新后恢复选中状态。
 * 对齐旧仓 dmworkchat `layoutStateStore` 的行为。
 */

interface ChatSidebarTabState {
  activeTab: ConvTab;
}

const STORAGE_KEY = "wk_sidebar_active_tab";

function readPersisted(): ChatSidebarTabState {
  if (typeof window === "undefined") return { activeTab: "follow" };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { activeTab: "follow" };
    const tab = JSON.parse(raw) as unknown;
    return tab === "follow" || tab === "recent" ? { activeTab: tab } : { activeTab: "follow" };
  } catch {
    return { activeTab: "follow" };
  }
}

export const chatSidebarTabStore = new Store<ChatSidebarTabState>(readPersisted());

export const chatSidebarTabActions = {
  setTab: (tab: ConvTab) => {
    chatSidebarTabStore.setState(() => ({ activeTab: tab }));
  },
};

export function persistChatSidebarTab(): void {
  if (typeof window === "undefined") return;
  chatSidebarTabStore.subscribe(() => {
    try {
      const { activeTab } = chatSidebarTabStore.state;
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(activeTab));
    } catch {
      // ignore storage quota / private mode errors
    }
  });
}
