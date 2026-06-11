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
let persistenceWired = false;

function normalizeTab(value: unknown): ConvTab | null {
  return value === "follow" || value === "recent" ? value : null;
}

function readPersisted(): ChatSidebarTabState {
  if (typeof window === "undefined") return { activeTab: "follow" };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { activeTab: "follow" };
    const rawTab = normalizeTab(raw);
    if (rawTab) return { activeTab: rawTab };
    const parsedTab = normalizeTab(JSON.parse(raw) as unknown);
    return parsedTab ? { activeTab: parsedTab } : { activeTab: "follow" };
  } catch {
    return { activeTab: "follow" };
  }
}

function writePersisted(tab: ConvTab): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, tab);
  } catch {
    // ignore storage quota / private mode errors
  }
}

export const chatSidebarTabStore = new Store<ChatSidebarTabState>(readPersisted());

export const chatSidebarTabActions = {
  setTab: (tab: ConvTab) => {
    chatSidebarTabStore.setState(() => ({ activeTab: tab }));
    writePersisted(tab);
  },
};

export function persistChatSidebarTab(): void {
  if (typeof window === "undefined") return;
  if (persistenceWired) return;
  persistenceWired = true;
  chatSidebarTabStore.subscribe(() => {
    writePersisted(chatSidebarTabStore.state.activeTab);
  });
}
