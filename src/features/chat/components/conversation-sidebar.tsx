import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import { type Conversation } from "wukongimjssdk";
import { Search, Plus } from "lucide-react";
import { toast } from "@/components/semi-bridge/toast";
import { spaceStore } from "@/features/base/stores/space";
import { mySpacesQueryOptions } from "@/features/base/queries/spaces.query";
import { ConnectionStatusBadge } from "@/features/chat/components/connection-status-badge";
import { ConversationList, type ConvTab } from "@/features/chat/components/conversation-list";
import { CreateGroupModal } from "@/features/chat/components/create-group-modal";
import { FollowList } from "@/features/chat/components/follow-list";
import { FriendAddModal } from "@/features/chat/components/friend-add-modal";
import { GlobalSearchModal } from "@/features/chat/components/global-search-modal";
import { SidebarAddPopover } from "@/features/chat/components/sidebar-add-popover";
import { InputModal } from "@/features/base/components/modals/input-modal";
import { createCategory } from "@/features/base/api/endpoints/follow.api";
import { categoriesQueryKey } from "@/features/chat/queries/categories.query";

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
 *   └ Conversation/Follow list                   ┘
 *
 * Space 名:拉 GET /v1/space/my,按 spaceStore.spaceId 找匹配;无则取第一个;
 * 列表空 fallback "默认空间"(用户首次未加入任何空间)。
 *
 * 连接状态:右侧 ConnectionStatusBadge(信号格 + ms),hover tooltip 看详情。
 *
 * 列表切换:
 * - 最近 → ConversationList(全量会话,按时间序)
 * - 关注 → FollowList(分组视图,/v1/spaces/{}/categories;P3+ 拖拽 + DM/子区关注)
 *
 * 🔍 触发 GlobalSearchModal(全局,联系人/群组/文件 3 tab)。
 * ➕ 弹出 SidebarAddPopover(发起群聊 / 添加朋友 / 创建分组)。
 */
export function ConversationSidebar({ selectedChannelId, onSelect }: ConversationSidebarProps) {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<ConvTab>("follow");
  const [searchOpen, setSearchOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [friendAddOpen, setFriendAddOpen] = useState(false);
  const [createCategoryOpen, setCreateCategoryOpen] = useState(false);
  const addWrapRef = useRef<HTMLDivElement>(null);
  const currentSpaceId = useStore(spaceStore, (s) => s.spaceId);
  const { data: spaces } = useQuery(mySpacesQueryOptions());

  const currentSpaceName = (() => {
    if (!currentSpaceId) return "全部消息";
    const found = spaces?.find((s) => s.space_id === currentSpaceId);
    return found?.name ?? "全部消息";
  })();

  const createCategoryMu = useMutation({
    mutationFn: (name: string) => {
      if (!currentSpaceId) return Promise.reject(new Error("无 spaceId"));
      return createCategory(currentSpaceId, name.trim());
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: categoriesQueryKey(currentSpaceId) });
      setCreateCategoryOpen(false);
      // 自动切到关注 tab,让用户看到刚创建的分组
      setActiveTab("follow");
      toast.success("已创建分组");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "创建失败"),
  });

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
              title="发起群聊 / 添加朋友"
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
              onAddFriend={() => setFriendAddOpen(true)}
              onCreateCategory={() => setCreateCategoryOpen(true)}
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

      {activeTab === "follow" ? (
        <FollowList selectedChannelId={selectedChannelId} onSelect={onSelect} />
      ) : (
        <ConversationList
          selectedChannelId={selectedChannelId}
          onSelect={onSelect}
          filter={activeTab}
        />
      )}

      <GlobalSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
      <CreateGroupModal open={createGroupOpen} onClose={() => setCreateGroupOpen(false)} />
      <FriendAddModal open={friendAddOpen} onClose={() => setFriendAddOpen(false)} />
      {createCategoryOpen ? (
        <InputModal
          open
          title="创建分组"
          placeholder="输入分组名"
          validate={(v) => v.trim().length > 0}
          okLoading={createCategoryMu.isPending}
          onOk={(v) => createCategoryMu.mutate(v)}
          onCancel={() => setCreateCategoryOpen(false)}
        />
      ) : null}
    </aside>
  );
}
