import { useRef, useState } from "react";
import { useStore } from "@tanstack/react-store";
import { useQuery } from "@tanstack/react-query";
import { type Conversation } from "wukongimjssdk";
import { Search, Plus } from "lucide-react";
import { toast } from "@/components/semi-bridge/toast";
import { spaceStore } from "@/features/base/stores/space";
import { mySpacesQueryOptions } from "@/features/base/queries/spaces.query";
import { ConnectionStatusBadge } from "@/features/chat/components/connection-status-badge";
import { ConversationList, type ConvTab } from "@/features/chat/components/conversation-list";
import { CreateGroupModal } from "@/features/chat/components/create-group-modal";
import { GlobalSearchModal } from "@/features/chat/components/global-search-modal";
import { SidebarAddPopover } from "@/features/chat/components/sidebar-add-popover";

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
 *   ┌ Header                                    ┐
 *   │ Space 名               ▁▃▅ 13ms 🔍 ➕    │
 *   ├ TabBar(SidebarTabBar)                     │  关注 / 最近
 *   └ ConversationList(filter)                  ┘
 *
 * Space 名:拉 GET /v1/space/my,按 spaceStore.spaceId 找匹配;无则取第一个;
 * 列表空 fallback "默认空间"(用户首次未加入任何空间)。
 *
 * 连接状态:右侧 ConnectionStatusBadge(信号格 + ms),hover tooltip 看详情。
 *
 * 🔍 触发 GlobalSearchModal(全局,联系人/群组/文件 3 tab)。
 * ➕ 弹出 SidebarAddPopover(发起群聊;关注 tab 下额外"创建分组")。
 */
export function ConversationSidebar({ selectedChannelId, onSelect }: ConversationSidebarProps) {
  const [activeTab, setActiveTab] = useState<ConvTab>("recent");
  const [searchOpen, setSearchOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const addWrapRef = useRef<HTMLDivElement>(null);
  const currentSpaceId = useStore(spaceStore, (s) => s.spaceId);
  const { data: spaces } = useQuery(mySpacesQueryOptions());

  const currentSpaceName = (() => {
    if (!currentSpaceId) return "全部消息";
    const found = spaces?.find((s) => s.space_id === currentSpaceId);
    return found?.name ?? "全部消息";
  })();

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-border-subtle bg-bg-base">
      <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border-subtle bg-bg-surface px-4">
        <span className="min-w-0 truncate text-sm font-semibold text-text-primary">
          {currentSpaceName}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <ConnectionStatusBadge />
          <button
            type="button"
            aria-label="搜索"
            title="全局搜索"
            onClick={() => setSearchOpen(true)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
          >
            <Search size={16} />
          </button>
          <div ref={addWrapRef} className="relative">
            <button
              type="button"
              aria-label="新增"
              title="发起群聊"
              onClick={() => setAddOpen((v) => !v)}
              className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
                addOpen
                  ? "bg-bg-hover text-text-primary"
                  : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
              }`}
            >
              <Plus size={16} />
            </button>
            <SidebarAddPopover
              containerRef={addWrapRef}
              open={addOpen}
              showCreateCategory={activeTab === "follow"}
              onClose={() => setAddOpen(false)}
              onStartGroup={() => setCreateGroupOpen(true)}
              onCreateCategory={() => toast.info("分组功能即将推出")}
            />
          </div>
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

      <GlobalSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
      <CreateGroupModal open={createGroupOpen} onClose={() => setCreateGroupOpen(false)} />
    </aside>
  );
}
