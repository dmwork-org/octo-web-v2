import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import { type Conversation } from "wukongimjssdk";
import { Search, Plus } from "lucide-react";
import { toast } from "@/components/semi-bridge/toast";
import { spaceStore } from "@/features/base/stores/space";
import { mySpacesQueryOptions } from "@/features/base/queries/spaces.query";
import {
  chatSidebarTabStore,
  chatSidebarTabActions,
} from "@/features/chat/stores/chat-sidebar-tab";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useT } from "@/lib/i18n/use-t";
import { chatRecentJumpActions } from "@/features/chat/stores/chat-recent-jump";
import { t } from "@/lib/i18n/instance";

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
  labelKey: string;
}

const TABS: TabDef[] = [
  { id: "follow", labelKey: "convSidebar.tabFollow" },
  { id: "recent", labelKey: "convSidebar.tabRecent" },
];

/**
 * 会话 sidebar 容器(对应旧 .wk-chat-content-left)。
 */
export function ConversationSidebar({ selectedChannelId, onSelect }: ConversationSidebarProps) {
  const tt = useT();
  const qc = useQueryClient();
  const activeTab = useStore(chatSidebarTabStore, (s) => s.activeTab);

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
    if (!currentSpaceId) return tt("convSidebar.allMessages");
    const found = spaces?.find((s) => s.space_id === currentSpaceId);
    return found?.name ?? tt("convSidebar.allMessages");
  })();

  const recentUnread = useMemo(() => {
    // 信任后端最近会话列表(对齐上游 f85ba4d0):删除 3 天不活跃过滤,
    // tab 角标跟列表渲染共用一套口径,避免角标 N 但列表看不到。
    const list = conversations ?? [];
    return list.reduce((sum, c) => {
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
      if (!currentSpaceId) return Promise.reject(new Error(t("convSidebar.error.noSpaceId")));
      return createCategory(currentSpaceId, name.trim());
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: categoriesQueryKey(currentSpaceId) });
      setCreateCategoryOpen(false);
      chatSidebarTabActions.setTab("follow");
      toast.success(t("convSidebar.toast.categoryCreated"));
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("convSidebar.toast.createFailed")),
  });

  return (
    <aside
      ref={panelRef}
      style={{ width }}
      className="relative flex shrink-0 flex-col border-r border-border-subtle bg-bg-base"
    >
      <header className="flex h-12 shrink-0 items-center justify-between gap-2 p-3">
        <span className="min-w-0 flex-1 truncate text-base font-semibold text-text-primary">
          {currentSpaceName}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <ConnectionStatusBadge />
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={tt("convSidebar.searchAria")}
                onClick={() => setSearchOpen(true)}
                className="flex h-4 w-4 cursor-pointer items-center justify-center text-text-tertiary transition-colors hover:text-text-primary"
              >
                <Search size={16} />
              </button>
            </TooltipTrigger>
            <TooltipContent>{tt("convSidebar.searchTooltip")}</TooltipContent>
          </Tooltip>
          <div ref={addWrapRef} className="relative">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={tt("convSidebar.addAria")}
                  onClick={() => setAddOpen((v) => !v)}
                  className={`flex h-4 w-4 cursor-pointer items-center justify-center transition-colors ${
                    addOpen ? "text-text-primary" : "text-text-tertiary hover:text-text-primary"
                  }`}
                >
                  <Plus size={16} />
                </button>
              </TooltipTrigger>
              <TooltipContent>{tt("convSidebar.addTooltip")}</TooltipContent>
            </Tooltip>
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

      <nav className="flex shrink-0 justify-center px-3 pb-2">
        <div className="flex w-full items-center gap-0 rounded-full bg-[rgba(52,59,58,0.05)] p-0.5">
          {TABS.map((tabDef) => {
            const isActive = activeTab === tabDef.id;
            const unread = tabDef.id === "follow" ? followUnread : recentUnread;
            return (
              <button
                key={tabDef.id}
                type="button"
                onClick={() => {
                  // 重复点击 recent tab 且有未读 → 跳第一条未读(对齐上游 1f8c40a2)
                  if (isActive && tabDef.id === "recent" && recentUnread > 0) {
                    chatRecentJumpActions.trigger();
                    return;
                  }
                  chatSidebarTabActions.setTab(tabDef.id);
                }}
                className={`relative inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full px-2 py-1 text-sm font-medium transition-all duration-150 ease-(--ease-emphasized) ${
                  isActive
                    ? "bg-bg-surface text-text-primary shadow-sm"
                    : "text-text-tertiary hover:text-text-primary"
                }`}
              >
                <span className="shrink-0">{tt(tabDef.labelKey)}</span>
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
          title={tt("convSidebar.createCategoryTitle")}
          placeholder={tt("convSidebar.createCategoryPlaceholder")}
          validate={(v) => v.trim().length > 0}
          okLoading={createCategoryMu.isPending}
          onOk={(v) => createCategoryMu.mutate(v)}
          onCancel={() => setCreateCategoryOpen(false)}
        />
      ) : null}

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
