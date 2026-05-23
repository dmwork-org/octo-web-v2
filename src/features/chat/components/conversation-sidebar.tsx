import { useState } from "react";
import { useStore } from "@tanstack/react-store";
import { type Conversation } from "wukongimjssdk";
import { Search, Plus } from "lucide-react";
import { spaceStore } from "@/features/base/stores/space";
import { ConnectionStatusInline } from "@/features/chat/components/connection-status-inline";
import { ConversationList, type ConvTab } from "@/features/chat/components/conversation-list";

interface ConversationSidebarProps {
  selectedChannelId?: string;
  onSelect?: (c: Conversation) => void;
}

interface TabDef {
  id: ConvTab;
  label: string;
}

const TABS: TabDef[] = [
  { id: "follow", label: "关注" },
  { id: "recent", label: "最近" },
];

/**
 * 会话 sidebar 容器(对应旧 .wk-chat-content-left):
 *   ┌ Header(.wk-chat-search) ┐
 *   │ Space 名  · 连接状态     │
 *   │            🔍   ➕      │  ← actions: 搜索 / 新增(P3 弹 popover)
 *   ├ TabBar(SidebarTabBar)    │  关注 / 最近
 *   └ ConversationList(filter) ┘
 *
 * Space 名 P3-C24 接 SpaceList 后用真实空间名替换占位。
 * 搜索按钮 → P3-C11 GlobalSearch;新增按钮 → P3-C8 ChatMenusPopover。
 */
export function ConversationSidebar({ selectedChannelId, onSelect }: ConversationSidebarProps) {
  const [activeTab, setActiveTab] = useState<ConvTab>("recent");
  const spaceId = useStore(spaceStore, (s) => s.spaceId);
  const spaceName = spaceId || "默认空间";

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-border-subtle bg-bg-base">
      <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border-subtle bg-bg-surface px-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-sm font-semibold text-text-primary">{spaceName}</span>
          <ConnectionStatusInline />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label="搜索"
            title="搜索(P3-C11)"
            className="flex h-7 w-7 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
          >
            <Search size={16} />
          </button>
          <button
            type="button"
            aria-label="新增"
            title="发起群聊 / 创建分组(P3-C8)"
            className="flex h-7 w-7 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
          >
            <Plus size={16} />
          </button>
        </div>
      </header>

      <nav className="flex shrink-0 items-center gap-1 border-b border-border-subtle bg-bg-surface px-2 py-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={`relative flex-1 rounded-md py-1.5 text-xs font-medium transition-colors duration-150 ease-(--ease-emphasized) ${
              activeTab === t.id
                ? "bg-brand-tint text-text-primary"
                : "text-text-secondary hover:bg-bg-hover"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <ConversationList
        selectedChannelId={selectedChannelId}
        onSelect={onSelect}
        filter={activeTab}
      />
    </aside>
  );
}
