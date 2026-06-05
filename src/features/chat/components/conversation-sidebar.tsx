import { useMemo, useRef, useState } from "react";
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
import { conversationsQueryOptions } from "@/features/chat/queries/conversations.query";
import { sidebarFollowQueryOptions } from "@/features/chat/queries/sidebar.query";
import { effectiveMute } from "@/features/chat/lib/conversation-last-content";
import { SidebarTargetType } from "@/features/base/api/endpoints/sidebar.api";
import { useResizablePanel } from "@/features/chat/hooks/use-resizable-panel.hook";
import { DragOverlay, PanelSplitter } from "@/components/ui/panel-splitter";

/** sidebar 拖拽 range / 默认 — 1:1 对齐老仓 layoutWidth.ts SPLITTER_* */
const SIDEBAR_MIN_WIDTH = 190;
const SIDEBAR_MAX_WIDTH = 360;
const SIDEBAR_DEFAULT_WIDTH = 300;
const SIDEBAR_STORAGE_KEY = "wk-layout-left-width";

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

/** 最近 tab 显示阈值:群聊 3 天不活跃隐藏(跟 conversation-list 内部 RECENT_INACTIVE_THRESHOLD_MS 同) */
const RECENT_INACTIVE_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * 会话 sidebar 容器(对应旧 .wk-chat-content-left):
 *   ┌ Header                                    ┐
 *   │ Space 名               ▁▃▅ 13ms 🔍 ➕    │
 *   ├ SidebarTabBar(胶囊 pill)                  │  [关注 N] [最近 M]
 *   └ Conversation/Follow list                   ┘
 *
 * **Tab 形态 1:1 对齐老仓 SidebarTabBar(设计稿 v3.1)**:
 *   - 胶囊容器:bg-bg-elevated/60 + rounded-full + p-0.5(2px outer padding)
 *   - 按钮:flex-1 + rounded-full + 居中,激活 → 白色 bg-bg-surface + shadow-sm,非激活 → 透明 + 灰字
 *   - badge:淡红底(error/15) + 红字(error) + 16×16 圆角胶囊,follow/recent 未读 count
 *     · 99+ 截断,99+ 三字符同款
 *
 * **未读计算(对齐老仓 Pages/Chat 行 127-151)**:
 *   - recentUnread:conversations 过滤 isVisibleInRecentTab(3 天不活跃群隐藏)+ effectiveMute(静音不计)
 *     再 sum unread
 *   - followUnread:sidebar items 中 reduce — **只用 IM cache 的 live unread**(不 fallback
 *     sidebar items 的 unread 快照)。原因:follow-list 里 useSyncOnConversationChange 让任何
 *     conversation 推送都 invalidate sidebar query → 重拉 `/sidebar/sync`,而后端返回的 it.unread
 *     会比 IM 实时状态延迟数百 ms;若 fallback it.unread,新建群瞬间(items 已有新群 unread=1,
 *     但 conversations cache 还没写入 → liveConv 不存在 → 走 it.unread=1)会出现"假徽标晃一下"
 *     再消失,体验差。代价:用户 follow 了但**从未聊过**的群(sidebar-only,IM cache 真没缓存)
 *     的 unread 漏算 — 老仓也有"晃一下"的同款问题,这条优化把它消掉;静音不计
 *
 * Space 名 / 连接状态 / 列表切换 / 🔍 / ➕ 同旧。
 */
export function ConversationSidebar({ selectedChannelId, onSelect }: ConversationSidebarProps) {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<ConvTab>("follow");

  // sidebar 宽度拖拽(右边缘 splitter,对齐老仓 WKLayout)
  const { width, isDragging, panelRef, onSplitterMouseDown, onSplitterDoubleClick } =
    useResizablePanel({
      storageKey: SIDEBAR_STORAGE_KEY,
      defaultWidth: SIDEBAR_DEFAULT_WIDTH,
      minWidth: SIDEBAR_MIN_WIDTH,
      getMaxWidth: () => SIDEBAR_MAX_WIDTH,
      edge: "right",
    });
  const [searchOpen, setSearchOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [friendAddOpen, setFriendAddOpen] = useState(false);
  const [createCategoryOpen, setCreateCategoryOpen] = useState(false);
  const addWrapRef = useRef<HTMLDivElement>(null);
  const currentSpaceId = useStore(spaceStore, (s) => s.spaceId);
  const { data: spaces } = useQuery(mySpacesQueryOptions());

  // tab badge 用:conversations(用于 recent + follow live unread)+ sidebar(follow 兜底)
  const { data: conversations } = useQuery(conversationsQueryOptions(currentSpaceId));
  const { data: sidebarFollow } = useQuery({
    ...sidebarFollowQueryOptions(currentSpaceId),
    enabled: !!currentSpaceId,
  });

  const currentSpaceName = (() => {
    if (!currentSpaceId) return "全部消息";
    const found = spaces?.find((s) => s.space_id === currentSpaceId);
    return found?.name ?? "全部消息";
  })();

  const recentUnread = useMemo(() => {
    const list = conversations ?? [];
    const now = Date.now();
    return list.reduce((sum, c) => {
      // 群聊 3 天不活跃隐藏(对齐 conversation-list isVisibleInRecentTab):列表不显的不算 badge
      if (
        c.channel.channelType === 2 &&
        now - (c.timestamp || 0) * 1000 >= RECENT_INACTIVE_THRESHOLD_MS
      ) {
        return sum;
      }
      if (effectiveMute(c)) return sum;
      return sum + (c.unread || 0);
    }, 0);
  }, [conversations]);

  const followUnread = useMemo(() => {
    const items = sidebarFollow?.items ?? [];
    const list = conversations ?? [];
    return items.reduce((sum, it) => {
      let channelType: number | null = null;
      if (it.target_type === SidebarTargetType.DM) channelType = 1;
      else if (it.target_type === SidebarTargetType.CHANNEL) channelType = 2;
      else if (it.target_type === SidebarTargetType.THREAD) channelType = 5;
      if (channelType == null) return sum;
      // **只用 IM live unread,不 fallback sidebar it.unread** — 避免新建群瞬间
      // sidebar 刚 refetch 带回 unread=1,conversations 还没写入新群 →
      // 走 it.unread=1 → 假徽标晃一下再消失(参考 sidebar 顶部注释)
      const liveConv = list.find(
        (c) => c.channel.channelType === channelType && c.channel.channelID === it.target_id,
      );
      if (!liveConv) return sum;
      if (effectiveMute(liveConv)) return sum;
      return sum + (liveConv.unread || 0);
    }, 0);
  }, [sidebarFollow, conversations]);

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
    // 整个 sidebar bg = bg-bg-base(对齐老仓 .wk-chat-content-left bg=--wk-bg-base)
    // border-r 1px subtle — 对齐老仓 .wk-layout-content-left border-right
    // = rgba(0,0,0,0.05)(分隔 sidebar 与右侧聊天区,splitter hide 时仍有视觉边界)
    <aside
      ref={panelRef}
      style={{ width }}
      className="relative flex shrink-0 flex-col border-r border-border-subtle bg-bg-base"
    >
      {/* Header — 透明背景、无 border-bottom、12px padding all(对齐老仓 .wk-chat-search) */}
      <header className="flex h-12 shrink-0 items-center justify-between gap-2 p-3">
        <span className="min-w-0 flex-1 truncate text-base font-semibold text-text-primary">
          {currentSpaceName}
        </span>
        {/* 右侧 actions:gap=8px,按钮 16×16 透明背景 hover 只换色,对齐老仓 .wk-chat-header-actions */}
        <div className="flex shrink-0 items-center gap-2">
          <ConnectionStatusBadge />
          <button
            type="button"
            aria-label="搜索"
            title="全局搜索"
            onClick={() => setSearchOpen(true)}
            className="flex h-4 w-4 cursor-pointer items-center justify-center text-text-tertiary transition-colors hover:text-text-primary"
          >
            <Search size={16} />
          </button>
          <div ref={addWrapRef} className="relative">
            <button
              type="button"
              aria-label="新增"
              title="发起群聊 / 添加朋友"
              onClick={() => setAddOpen((v) => !v)}
              className={`flex h-4 w-4 cursor-pointer items-center justify-center transition-colors ${
                addOpen ? "text-text-primary" : "text-text-tertiary hover:text-text-primary"
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

      {/* 胶囊 tab 栏(对齐老仓 .wk-sidebar-tabbar):outer pad 0 12px 8 / inner pill */}
      <nav className="flex shrink-0 justify-center px-3 pb-2">
        <div className="flex w-full items-center gap-0 rounded-full bg-[rgba(52,59,58,0.05)] p-0.5">
          {TABS.map((t) => {
            const isActive = activeTab === t.id;
            const unread = t.id === "follow" ? followUnread : recentUnread;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className={`relative inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full px-2 py-1 text-sm font-medium transition-all duration-150 ease-(--ease-emphasized) ${
                  isActive
                    ? "bg-bg-surface text-text-primary shadow-sm"
                    : "text-text-tertiary hover:text-text-primary"
                }`}
              >
                <span className="shrink-0">{t.label}</span>
                {unread > 0 ? (
                  <span className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-md bg-error/15 px-1 text-[10px] font-semibold leading-none text-error">
                    {unread > 99 ? "99+" : unread}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </nav>

      {activeTab === "follow" ? (
        <FollowList
          selectedChannelId={selectedChannelId}
          onSelect={onSelect}
          onCreateCategory={() => setCreateCategoryOpen(true)}
          onStartGroup={() => setCreateGroupOpen(true)}
        />
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

      {/* 右边缘 splitter:hover/drag 显紫色细线;双击重置默认 300 */}
      <PanelSplitter
        side="right"
        isDragging={isDragging}
        onMouseDown={onSplitterMouseDown}
        onDoubleClick={onSplitterDoubleClick}
      />
      {isDragging ? <DragOverlay /> : null}
    </aside>
  );
}
