import { type MouseEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import {
  DndContext,
  DragOverlay,
  type DragStartEvent,
  type DragEndEvent,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Channel, ChannelTypeGroup, ChannelTypePerson, type Conversation } from "wukongimjssdk";
import WKSDK from "wukongimjssdk";
import {
  ArrowDown,
  ArrowUp,
  BellOff,
  BellRing,
  Eye,
  FolderInput,
  MoreHorizontal,
  Pencil,
  Plus,
  Star,
  Trash2,
} from "lucide-react";
import { authStore } from "@/features/base/stores/auth";
import { spaceStore } from "@/features/base/stores/space";
import { toast } from "@/components/semi-bridge/toast";
import { ContextMenu, type ContextMenuItem } from "@/features/base/components/context-menu";
import { ConfirmModal } from "@/features/base/components/modals/confirm-modal";
import { InputModal } from "@/features/base/components/modals/input-modal";
import { FollowEmptyState } from "@/features/chat/components/follow-empty-state";
import { CreateGroupModal } from "@/features/chat/components/create-group-modal";
import { parseThreadChannelId } from "@/features/base/im/parse-thread-channel-id";
import {
  filterArchivedThreads,
  isArchivedThread,
  isThreadArchivedForBadge,
  type ThreadSidebarStatusMap,
} from "@/features/chat/lib/thread-status";
import { ThreadIcon } from "@/components/ui/thread-icon";
import { MuteIcon } from "@/components/ui/mute-icon";
import { getLiveTitle, tryFetchChannelInfo } from "@/features/chat/lib/live-channel-title";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { isMentionMe as computeMentionMe } from "@/features/chat/lib/conversation-last-content";
import {
  categoriesQueryKey,
  categoriesQueryOptions,
} from "@/features/chat/queries/categories.query";
import { conversationsQueryOptions } from "@/features/chat/queries/conversations.query";
import { useConversationsSync } from "@/features/chat/hooks/use-conversations-sync.hook";
import {
  type SidebarFollowDerived,
  sidebarFollowQueryKey,
  sidebarFollowQueryOptions,
} from "@/features/chat/queries/sidebar.query";
import { useExpandedGroupIds } from "@/features/chat/hooks/use-expanded-group-ids.hook";
import { useConversationActions } from "@/features/chat/hooks/use-conversation-actions.hook";
import {
  type CategoryItem,
  createCategory,
  deleteCategory,
  followDM,
  moveGroupToCategory,
  renameCategory,
  sortCategories,
} from "@/features/base/api/endpoints/follow.api";
import { type SidebarItem, SidebarTargetType } from "@/features/base/api/endpoints/sidebar.api";
import { useSortFollow } from "@/features/chat/hooks/use-sort-follow.hook";
import { useT } from "@/lib/i18n/use-t";
import { t } from "@/lib/i18n/instance";

interface FollowListProps {
  selectedChannelId?: string;
  onSelect?: (c: Conversation) => void;
  onCreateCategory?: () => void;
  onStartGroup?: () => void;
}

const CHANNEL_TYPE_THREAD = 5;

function buildFollowedThreadsByParent(
  conversations: Conversation[],
  derived: SidebarFollowDerived,
): Map<string, Conversation[]> {
  const { followedKeys, items } = derived;
  const map = new Map<string, Conversation[]>();

  const threadParentFromSidebar = new Map<string, string>();
  for (const it of items) {
    if (it.target_type !== SidebarTargetType.THREAD) continue;
    if (!it.parent_channel_id) continue;
    threadParentFromSidebar.set(it.target_id, it.parent_channel_id);
  }

  const seen = new Set<string>();

  for (const c of conversations) {
    if (c.channel.channelType !== CHANNEL_TYPE_THREAD) continue;
    if (!followedKeys.has(`${SidebarTargetType.THREAD}::${c.channel.channelID}`)) continue;
    const orgParent = (c.channelInfo?.orgData as { parentGroupNo?: string } | undefined)
      ?.parentGroupNo;
    const parent =
      threadParentFromSidebar.get(c.channel.channelID) ??
      orgParent ??
      parseThreadChannelId(c.channel.channelID)?.groupNo;
    if (!parent) continue;
    const arr = map.get(parent) ?? [];
    arr.push(c);
    map.set(parent, arr);
    seen.add(c.channel.channelID);
  }

  for (const it of items) {
    if (it.target_type !== SidebarTargetType.THREAD) continue;
    if (seen.has(it.target_id)) continue;
    const parent = it.parent_channel_id ?? parseThreadChannelId(it.target_id)?.groupNo ?? undefined;
    if (!parent) continue;
    const channel = new Channel(it.target_id, CHANNEL_TYPE_THREAD);
    tryFetchChannelInfo(channel);
    const stub: Conversation = {
      channel,
      channelInfo: undefined,
      timestamp: it.timestamp,
      unread: it.unread,
    } as unknown as Conversation;
    const arr = map.get(parent) ?? [];
    arr.push(stub);
    map.set(parent, arr);
    seen.add(it.target_id);
  }

  for (const [k, arr] of map) {
    map.set(
      k,
      [...arr].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)),
    );
  }
  return map;
}

function findConv(channelId: string, channelType: number): Conversation | undefined {
  const channel = new Channel(channelId, channelType);
  return WKSDK.shared().conversationManager.findConversation(channel);
}

function unreadBadge(unread: number): string {
  if (unread <= 0) return "";
  return unread > 99 ? "99+" : String(unread);
}

function makeDragId(targetType: number, targetId: string): string {
  return `item::${targetType}::${targetId}`;
}

function parseDragId(id: string): { targetType: number; targetId: string } | null {
  if (!id.startsWith("item::")) return null;
  const parts = id.slice("item::".length).split("::");
  if (parts.length < 2) return null;
  return { targetType: Number(parts[0]), targetId: parts.slice(1).join("::") };
}

/**
 * 拖拽 ghost 渲染(对齐老仓 ConversationListGrouped DragOverlay,issue #12):
 *
 * dnd-kit 默认行为是把 transform 应用到原 DOM,被 SortableContext 内的
 * `overflow-y-auto` 滚动容器 / 父 layout cascade 影响 → 拖拽时被拖项视觉
 * "撕裂 / 变形"。`DragOverlay` 渲染一个 fixed-positioned 的 ghost 跟随
 * 鼠标,脱离 SortableContext 容器布局,视觉稳定。
 *
 * 本仓 ghost 只显 icon + 名字简版(对齐老仓 wk-conv-compact-item--ghost):
 *   - cat::xxx → 分类名(简洁灰底白字)
 *   - item::N::id → 频道名(icon + name)
 *
 * 不重做完整 row(避免 ghost 太大遮挡 drop zone,老仓也用 ghost 精简版)。
 */
function renderDragGhost(
  dragId: string,
  categories: CategoryItem[],
  items: SidebarItem[],
): React.ReactNode {
  if (dragId.startsWith("cat::")) {
    const catIdRaw = dragId.slice("cat::".length);
    const cat = categories.find((c) => (c.category_id ?? "default") === catIdRaw);
    if (!cat) return null;
    return (
      <div className="pointer-events-none flex items-center gap-2 rounded-md border border-border-default bg-bg-surface px-3 py-2 text-[12px] font-semibold text-text-secondary shadow-lg">
        <span>{cat.name}</span>
      </div>
    );
  }
  const parsed = parseDragId(dragId);
  if (!parsed) return null;
  const item = items.find(
    (it) => it.target_type === parsed.targetType && it.target_id === parsed.targetId,
  );
  if (!item) return null;
  let channelType = 0;
  if (item.target_type === SidebarTargetType.DM) channelType = ChannelTypePerson;
  else if (item.target_type === SidebarTargetType.CHANNEL) channelType = ChannelTypeGroup;
  else if (item.target_type === SidebarTargetType.THREAD) channelType = CHANNEL_TYPE_THREAD;
  const channel = new Channel(item.target_id, channelType);
  const channelInfo = WKSDK.shared().channelManager.getChannelInfo(channel);
  const title = channelInfo?.title || item.target_id;
  return (
    <div className="pointer-events-none flex items-center gap-2 rounded-md border border-border-default bg-bg-surface px-3 py-1.5 text-[13px] text-text-primary shadow-lg">
      <ChannelAvatar channel={channel} size={20} title={title} />
      <span className="truncate">{title}</span>
    </div>
  );
}

interface DragProps {
  attributes: ReturnType<typeof useSortable>["attributes"];
  listeners: ReturnType<typeof useSortable>["listeners"];
}

function SortableRow({
  id,
  children,
}: {
  id: string;
  children: (dragProps: DragProps) => React.ReactNode;
}) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id,
  });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
    >
      {children({ attributes, listeners })}
    </div>
  );
}

function DragHandle({ attributes, listeners }: DragProps) {
  const tt = useT();
  return (
    <span
      {...attributes}
      {...listeners}
      onClick={(e) => e.stopPropagation()}
      className="-ml-1 flex h-5 w-3.5 shrink-0 cursor-grab items-center justify-center text-text-tertiary opacity-0 transition-opacity duration-150 group-hover/row:opacity-100 active:cursor-grabbing"
      aria-label={tt("followList.dragSort")}
    >
      <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" aria-hidden>
        <circle cx="3" cy="3" r="1.2" />
        <circle cx="7" cy="3" r="1.2" />
        <circle cx="3" cy="7" r="1.2" />
        <circle cx="7" cy="7" r="1.2" />
        <circle cx="3" cy="11" r="1.2" />
        <circle cx="7" cy="11" r="1.2" />
      </svg>
    </span>
  );
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5">
      <span className="skeleton-shimmer h-[22px] w-[22px] shrink-0 rounded-[5px]" />
      <span className="skeleton-shimmer h-3 w-24 rounded-sm" />
    </div>
  );
}

const SKELETON_STYLE = `
.skeleton-shimmer {
  background: linear-gradient(90deg,
    rgba(28,28,35,0.10) 25%,
    rgba(28,28,35,0.22) 50%,
    rgba(28,28,35,0.10) 75%);
  background-size: 200% 100%;
  animation: wk-skeleton-shimmer 1.2s infinite linear;
}
@keyframes wk-skeleton-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
`;

interface CompactRowProps {
  variant: "group" | "dm" | "thread";
  channel: Channel;
  title: string;
  unread: number;
  isMuted: boolean;
  isMentionMe?: boolean;
  isExternal?: boolean;
  hasThreads?: boolean;
  threadsExpanded?: boolean;
  onToggleThreads?: () => void;
  selected: boolean;
  onClick: () => void;
  onContextMenu?: (e: MouseEvent) => void;
}

interface CompactRowProps2 extends CompactRowProps {
  titleLoading?: boolean;
  dragProps?: DragProps | null;
}

function CompactRow({
  variant,
  channel,
  title,
  unread,
  isMuted,
  isMentionMe,
  isExternal,
  hasThreads,
  threadsExpanded,
  onToggleThreads,
  selected,
  onClick,
  titleLoading,
  dragProps,
  onContextMenu,
}: CompactRowProps2) {
  const tt = useT();
  const hasUnread = unread > 0;
  const isThread = variant === "thread";
  const onThreadTagClick = (e: MouseEvent) => {
    e.stopPropagation();
    onToggleThreads?.();
  };
  const bgClass = selected ? "bg-[rgba(28,28,35,0.06)]" : "hover:bg-[rgba(46,50,56,0.09)]";
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={`group/row relative flex w-full cursor-pointer items-center gap-2 rounded-[4px] px-2 text-left transition-colors duration-120 ${bgClass} ${
        isThread ? "min-h-[26px] gap-1.5 py-[3px] pl-9" : "min-h-[30px] py-[5px]"
      }`}
    >
      {dragProps ? <DragHandle {...dragProps} /> : null}

      <span
        className={`relative flex shrink-0 items-center justify-center ${
          isThread ? "h-[14px] w-[14px] text-[#1c1c23]/40" : "h-[22px] w-[22px] text-text-secondary"
        }`}
      >
        {isThread ? (
          <ThreadIcon size={13} />
        ) : (
          <ChannelAvatar channel={channel} size={22} title={title} />
        )}
        {hasUnread ? (
          <span
            aria-hidden
            className="absolute -top-[1px] -left-[1px] h-[6px] w-[6px] rounded-full border border-bg-base bg-error"
          />
        ) : null}
      </span>

      {isMentionMe && hasUnread ? (
        <span className="inline-flex h-[14px] shrink-0 items-center rounded-md bg-error/15 px-1 text-[10px] leading-none font-semibold text-error">
          {tt("followList.mentionMe")}
        </span>
      ) : null}

      {titleLoading ? (
        <span
          aria-hidden
          className={`skeleton-shimmer h-[12px] flex-1 rounded-sm ${isThread ? "max-w-[64px]" : "max-w-[120px]"}`}
        />
      ) : (
        <span
          className={`min-w-0 flex-1 truncate text-[13px] leading-[1.4] ${
            isMuted
              ? "text-text-tertiary font-normal opacity-45"
              : isThread
                ? hasUnread
                  ? "font-medium text-[#1c1c23]/90"
                  : "font-normal text-[#1c1c23]/60"
                : hasUnread
                  ? "font-semibold text-text-primary"
                  : "font-medium text-[#1c1c23]/90"
          }`}
        >
          {title}
        </span>
      )}

      {!titleLoading ? (
        <>
          {isExternal ? (
            <span
              aria-label={tt("followList.externalGroup")}
              className="shrink-0 rounded-sm bg-brand-tint px-1 text-[10px] font-medium text-text-secondary"
            >
              {tt("followList.external")}
            </span>
          ) : null}
          {isMuted ? <MuteIcon size={11} className="shrink-0 text-text-tertiary" /> : null}
          {hasUnread && !isMuted ? (
            <span
              aria-label={tt("followList.unreadAria", { values: { count: unread } })}
              className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-error/15 px-1 text-[10px] font-semibold leading-none text-error"
            >
              {unreadBadge(unread)}
            </span>
          ) : null}
          {hasThreads ? (
            <span
              role="button"
              tabIndex={0}
              aria-label={
                threadsExpanded ? tt("followList.collapseThreads") : tt("followList.expandThreads")
              }
              title={
                threadsExpanded ? tt("followList.collapseThreads") : tt("followList.expandThreads")
              }
              onClick={onThreadTagClick}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  onToggleThreads?.();
                }
              }}
              className="ml-0.5 flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-[4px] text-[#6569E8] opacity-85 transition-all hover:bg-accent/12 hover:opacity-100"
            >
              <ThreadIcon size={13} />
            </span>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function isThreadEffectivelyMuted(
  thread: Conversation,
  parentGroupNo: string | undefined,
): boolean {
  const selfMute = thread.channelInfo?.mute;
  if (selfMute != null) return !!selfMute;
  if (!parentGroupNo) return false;
  const parentInfo = WKSDK.shared().channelManager.getChannelInfo(
    new Channel(parentGroupNo, ChannelTypeGroup),
  );
  return !!parentInfo?.mute;
}

function aggregateThreadUnread(threads: Conversation[], parentGroupNo: string): number {
  return threads.reduce((sum, t) => {
    // 跳过已归档子区,保持"角标数 = 列表可见未读"一致(对齐上游 645fa295)
    if (isArchivedThread(t)) return sum;
    if (isThreadEffectivelyMuted(t, parentGroupNo)) return sum;
    return sum + (t.unread || 0);
  }, 0);
}

function buildThreadSidebarStatus(items: SidebarItem[]): ThreadSidebarStatusMap {
  const statusMap: ThreadSidebarStatusMap = new Map();
  for (const it of items) {
    if (it.target_type !== SidebarTargetType.THREAD) continue;
    if (it.status == null) continue;
    statusMap.set(it.target_id, it.status);
  }
  return statusMap;
}

interface CategorySectionProps {
  category: CategoryItem;
  collapsed: boolean;
  onToggle: () => void;
  onContextMenu: (e: MouseEvent) => void;
  /** 当前被右键的分组 id(临时高亮,菜单关闭清);命中 → 分组 row 高亮。 */
  ctxMenuActive?: boolean;
  sidebarItems: SidebarItem[];
  followedThreadsByParent: Map<string, Conversation[]>;
  threadSidebarStatus: ThreadSidebarStatusMap;
  selectedChannelId?: string;
  /** 当前被右键的 row key(`${channelType}::${channelID}`),命中 → row 高亮(对齐选中色)。 */
  ctxMenuRowKey?: string | null;
  myUid: string;
  isExpanded: (groupId: string) => boolean;
  onToggleExpand: (groupId: string) => void;
  onSelectGroup: (groupNo: string) => void;
  onSelectDM: (peerUid: string) => void;
  onSelectThread: (threadChannelId: string) => void;
  onRowContextMenu?: (channel: Channel) => (e: MouseEvent) => void;
}

function aggregateCategoryStats(
  sidebarItems: SidebarItem[],
  myUid: string,
  threadSidebarStatus: ThreadSidebarStatusMap,
): { unread: number; hasMention: boolean } {
  let unread = 0;
  let hasMention = false;
  for (const it of sidebarItems) {
    let channelType: number;
    if (it.target_type === SidebarTargetType.DM) channelType = ChannelTypePerson;
    else if (it.target_type === SidebarTargetType.CHANNEL) channelType = ChannelTypeGroup;
    else if (it.target_type === SidebarTargetType.THREAD) channelType = CHANNEL_TYPE_THREAD;
    else continue;
    const conv = findConv(it.target_id, channelType);
    if (
      it.target_type === SidebarTargetType.THREAD &&
      isThreadArchivedForBadge(conv, it.target_id, threadSidebarStatus)
    ) {
      continue;
    }
    const isMuted = !!conv?.channelInfo?.mute;
    if (!isMuted) unread += conv?.unread ?? it.unread ?? 0;
    if (conv && computeMentionMe(conv, myUid)) hasMention = true;
  }
  return { unread, hasMention };
}

function CategorySection({
  category,
  collapsed,
  onToggle,
  onContextMenu,
  ctxMenuActive = false,
  sidebarItems,
  followedThreadsByParent,
  threadSidebarStatus,
  selectedChannelId,
  ctxMenuRowKey,
  myUid,
  isExpanded,
  onToggleExpand,
  onSelectGroup,
  onSelectDM,
  onSelectThread,
  onRowContextMenu,
}: CategorySectionProps) {
  const tt = useT();
  const [expandedThreadsSet, setExpandedThreadsSet] = useState<Set<string>>(new Set());
  const count = sidebarItems.length;
  const isEmpty = count === 0;
  const stats = useMemo(
    () => aggregateCategoryStats(sidebarItems, myUid, threadSidebarStatus),
    [sidebarItems, myUid, threadSidebarStatus],
  );

  const sortable = useSortable({
    id: `cat::${category.category_id ?? "default"}`,
    data: { type: "category", categoryId: category.category_id ?? "default" },
  });
  const catStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    opacity: sortable.isDragging ? 0.4 : undefined,
  };

  const nestedThreadIds = useMemo(() => {
    const s = new Set<string>();
    for (const arr of followedThreadsByParent.values()) {
      for (const t of arr) s.add(t.channel.channelID);
    }
    return s;
  }, [followedThreadsByParent]);

  const dropId = `drop::cat::${category.category_id ?? "default"}`;
  const { setNodeRef: setDropRef, isOver: isDropOver } = useDroppable({ id: dropId });

  // 行高亮判定:命中"当前选中频道"或"被右键临时高亮"任一即点亮(对齐选中色),
  // ctxMenuRowKey 由 caller(FollowList)在右键时 set,菜单关时 clear。
  const isRowActive = (ch: Channel) =>
    ch.channelID === selectedChannelId || ctxMenuRowKey === `${ch.channelType}::${ch.channelID}`;

  return (
    <section
      ref={(node) => {
        setDropRef(node);
        sortable.setNodeRef(node);
      }}
      style={catStyle}
      className={`group/cat flex flex-col rounded-sm transition-colors ${isDropOver ? "bg-brand-tint/30" : ""}`}
    >
      <header
        className={`flex cursor-pointer items-center gap-1 px-2 py-1.5 text-[12px] transition-colors hover:bg-bg-hover ${ctxMenuActive ? "bg-bg-hover" : ""} ${isEmpty ? "text-text-tertiary" : "text-text-secondary"}`}
        onClick={onToggle}
        onContextMenu={onContextMenu}
      >
        <span
          ref={sortable.setActivatorNodeRef}
          {...sortable.attributes}
          {...sortable.listeners}
          onClick={(e) => e.stopPropagation()}
          aria-label={tt("followList.dragCategory")}
          className="-ml-1 flex h-5 w-3.5 shrink-0 cursor-grab items-center justify-center text-text-tertiary opacity-0 transition-opacity duration-150 group-hover/cat:opacity-100 active:cursor-grabbing"
        >
          <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" aria-hidden>
            <circle cx="3" cy="3" r="1.2" />
            <circle cx="7" cy="3" r="1.2" />
            <circle cx="3" cy="7" r="1.2" />
            <circle cx="7" cy="7" r="1.2" />
            <circle cx="3" cy="11" r="1.2" />
            <circle cx="7" cy="11" r="1.2" />
          </svg>
        </span>
        <span
          aria-hidden
          className={`flex h-[10px] w-[10px] shrink-0 items-center justify-center text-text-tertiary transition-transform ${collapsed ? "-rotate-90" : ""}`}
        >
          <svg viewBox="0 0 16 16" width="10" height="10" fill="currentColor">
            <path d="M4 6l4 5 4-5z" />
          </svg>
        </span>
        <span className="min-w-0 flex-1 truncate font-semibold">
          {category.name}
          {isEmpty ? (
            <span className="ml-1 font-normal italic text-text-tertiary">
              {tt("followList.emptyMarker")}
            </span>
          ) : collapsed ? (
            <span className="ml-1 font-normal text-text-tertiary">({count})</span>
          ) : null}
        </span>
        {collapsed && !isEmpty && stats.unread > 0 ? (
          <span className="flex shrink-0 items-center gap-1">
            <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-error/15 px-1 text-[10px] font-semibold leading-none text-error">
              {stats.unread > 99 ? "99+" : stats.unread}
            </span>
            {stats.hasMention ? (
              <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-md bg-error/15 px-1 text-[10px] leading-none font-semibold text-error">
                @
              </span>
            ) : null}
          </span>
        ) : null}
      </header>
      {!collapsed ? (
        <div className="flex flex-col">
          {count === 0 ? (
            <div className="flex items-center justify-center px-3 py-2 text-[12px] italic text-text-tertiary">
              {tt("followList.noGroupsInCategory")}
            </div>
          ) : (
            (() => {
              const draggableIds = sidebarItems
                .filter(
                  (it) =>
                    it.target_type === SidebarTargetType.CHANNEL ||
                    it.target_type === SidebarTargetType.DM,
                )
                .map((it) => makeDragId(it.target_type, it.target_id));
              return (
                <SortableContext items={draggableIds} strategy={verticalListSortingStrategy}>
                  {sidebarItems.map((it) => {
                    if (it.target_type === SidebarTargetType.CHANNEL) {
                      const groupNo = it.target_id;
                      const conv = findConv(groupNo, ChannelTypeGroup);
                      const channel = conv?.channel ?? new Channel(groupNo, ChannelTypeGroup);
                      const live = getLiveTitle(channel);
                      const title =
                        live.title ||
                        category.groups.find((g) => g.group_no === groupNo)?.name ||
                        groupNo;
                      const titleLoading = live.loading;
                      const muted = !!conv?.channelInfo?.mute;
                      const threads = followedThreadsByParent.get(groupNo) ?? [];
                      // 父群 UI 看可见(非归档)子区:hasThreads 决定是否显"子区"按钮,
                      // 角标也只算活跃子区(对齐上游 645fa295)。拖拽 payload 仍用全量
                      // threads,归档隐藏不影响后端 follow_sort。
                      const visibleThreads = filterArchivedThreads(threads, threadSidebarStatus);
                      const expanded = isExpanded(groupNo);
                      const groupUnread = conv?.unread ?? it.unread;
                      const aggThreadUnread = expanded
                        ? 0
                        : aggregateThreadUnread(visibleThreads, groupNo);
                      return (
                        <SortableRow
                          key={`group-${groupNo}`}
                          id={makeDragId(SidebarTargetType.CHANNEL, groupNo)}
                        >
                          {(dragProps) => (
                            <>
                              <CompactRow
                                variant="group"
                                channel={channel}
                                title={title}
                                titleLoading={titleLoading}
                                unread={groupUnread + aggThreadUnread}
                                isMuted={muted}
                                isExternal={
                                  (
                                    conv?.channelInfo?.orgData as
                                      | { is_external_group?: number }
                                      | undefined
                                  )?.is_external_group === 1
                                }
                                isMentionMe={conv ? computeMentionMe(conv, myUid) : false}
                                hasThreads={visibleThreads.length > 0}
                                threadsExpanded={expanded}
                                onToggleThreads={() => onToggleExpand(groupNo)}
                                selected={isRowActive(channel)}
                                onClick={() => onSelectGroup(groupNo)}
                                dragProps={dragProps}
                                onContextMenu={onRowContextMenu?.(channel)}
                              />
                              {expanded
                                ? (() => {
                                    // 复用上面 visibleThreads(已 filterArchivedThreads)
                                    const showAll = expandedThreadsSet.has(groupNo);
                                    const MAX = 5;
                                    const visible = showAll
                                      ? visibleThreads
                                      : visibleThreads.slice(0, MAX);
                                    const hidden = visibleThreads.length - visible.length;
                                    return (
                                      <>
                                        {visible.map((th) => {
                                          const tLive = getLiveTitle(th.channel);
                                          return (
                                            <CompactRow
                                              key={`thread-${th.channel.channelID}`}
                                              variant="thread"
                                              channel={th.channel}
                                              title={tLive.title || th.channel.channelID}
                                              titleLoading={tLive.loading}
                                              unread={th.unread || 0}
                                              isMuted={isThreadEffectivelyMuted(th, groupNo)}
                                              isMentionMe={computeMentionMe(th, myUid)}
                                              selected={isRowActive(th.channel)}
                                              onClick={() => onSelectThread(th.channel.channelID)}
                                              onContextMenu={onRowContextMenu?.(th.channel)}
                                            />
                                          );
                                        })}
                                        {hidden > 0 ? (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setExpandedThreadsSet((prev) => {
                                                const next = new Set(prev);
                                                next.add(groupNo);
                                                return next;
                                              })
                                            }
                                            className="ml-12 px-3 py-1 text-left text-[12px] text-text-tertiary hover:text-text-secondary"
                                          >
                                            {tt("followList.viewMore", {
                                              values: { count: hidden },
                                            })}
                                          </button>
                                        ) : null}
                                      </>
                                    );
                                  })()
                                : null}
                            </>
                          )}
                        </SortableRow>
                      );
                    }
                    if (it.target_type === SidebarTargetType.DM) {
                      const peerUid = it.target_id;
                      const conv = findConv(peerUid, ChannelTypePerson);
                      const channel = conv?.channel ?? new Channel(peerUid, ChannelTypePerson);
                      const live = getLiveTitle(channel);
                      const title = live.title || peerUid;
                      const titleLoading = live.loading;
                      const muted = !!conv?.channelInfo?.mute;
                      const unread = conv?.unread ?? it.unread;
                      return (
                        <SortableRow
                          key={`dm-${peerUid}`}
                          id={makeDragId(SidebarTargetType.DM, peerUid)}
                        >
                          {(dragProps) => (
                            <CompactRow
                              variant="dm"
                              channel={channel}
                              title={title}
                              titleLoading={titleLoading}
                              unread={unread}
                              isMuted={muted}
                              isMentionMe={conv ? computeMentionMe(conv, myUid) : false}
                              selected={isRowActive(channel)}
                              onClick={() => onSelectDM(peerUid)}
                              dragProps={dragProps}
                              onContextMenu={onRowContextMenu?.(channel)}
                            />
                          )}
                        </SortableRow>
                      );
                    }
                    if (it.target_type === SidebarTargetType.THREAD) {
                      const tid = it.target_id;
                      if (nestedThreadIds.has(tid)) return null;
                      const conv = findConv(tid, CHANNEL_TYPE_THREAD);
                      const channel = conv?.channel ?? new Channel(tid, CHANNEL_TYPE_THREAD);
                      if (
                        isArchivedThread(
                          conv ?? ({ channel, channelInfo: undefined } as unknown as Conversation),
                          threadSidebarStatus,
                        )
                      ) {
                        return null;
                      }
                      const live = getLiveTitle(channel);
                      const title = live.title || tid;
                      const titleLoading = live.loading;
                      const parsed = parseThreadChannelId(tid);
                      const muted = isThreadEffectivelyMuted(
                        conv ?? ({ channelInfo: undefined } as unknown as Conversation),
                        parsed?.groupNo,
                      );
                      const unread = conv?.unread ?? it.unread;
                      return (
                        <CompactRow
                          key={`thread-standalone-${tid}`}
                          variant="thread"
                          channel={channel}
                          title={title}
                          titleLoading={titleLoading}
                          unread={unread}
                          isMuted={muted}
                          isMentionMe={conv ? computeMentionMe(conv, myUid) : false}
                          selected={isRowActive(channel)}
                          onClick={() => onSelectThread(tid)}
                          onContextMenu={onRowContextMenu?.(channel)}
                        />
                      );
                    }
                    return null;
                  })}
                </SortableContext>
              );
            })()
          )}
        </div>
      ) : null}
    </section>
  );
}

export function FollowList({
  selectedChannelId,
  onSelect,
  onCreateCategory,
  onStartGroup,
}: FollowListProps) {
  const tt = useT();
  const qc = useQueryClient();
  const spaceId = useStore(spaceStore, (s) => s.spaceId);
  const myUid = useStore(authStore, (s) => s.user?.uid ?? "");
  useConversationsSync();

  const categoriesQ = useQuery(categoriesQueryOptions(spaceId));
  const sidebarQ = useQuery(sidebarFollowQueryOptions(spaceId));
  const conversationsQ = useQuery(conversationsQueryOptions(spaceId));

  const { isExpanded, toggle: toggleExpand } = useExpandedGroupIds(myUid, spaceId);

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggleCollapse = (id: string) => setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));

  const { sortCategory } = useSortFollow(spaceId);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const handleDragStart = (e: DragStartEvent) => setActiveDragId(String(e.active.id));
  const handleDragCancel = () => setActiveDragId(null);

  const moveGroupMu = useMutation({
    mutationFn: (args: { groupNo: string; categoryId: string }) =>
      moveGroupToCategory(args.groupNo, args.categoryId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: sidebarFollowQueryKey(spaceId) });
      void qc.invalidateQueries({ queryKey: categoriesQueryKey(spaceId) });
      toast.success(t("followList.toast.movedToCategory"));
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : t("followList.toast.moveFailed"));
      void qc.invalidateQueries({ queryKey: sidebarFollowQueryKey(spaceId) });
    },
  });
  const moveDmMu = useMutation({
    mutationFn: (args: { peerUid: string; categoryId: string | null }) =>
      followDM(args.peerUid, args.categoryId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: sidebarFollowQueryKey(spaceId) });
      toast.success(t("followList.toast.movedDmToCategory"));
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : t("followList.toast.moveFailed"));
      void qc.invalidateQueries({ queryKey: sidebarFollowQueryKey(spaceId) });
    },
  });

  const sortCategoriesMu = useMutation({
    mutationFn: (categoryIds: string[]) => {
      if (!spaceId) return Promise.reject(new Error(t("followList.error.noSpaceId")));
      return sortCategories(spaceId, categoryIds);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: categoriesQueryKey(spaceId) });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : t("followList.toast.sortCategoryFailed"));
      void qc.invalidateQueries({ queryKey: categoriesQueryKey(spaceId) });
    },
  });

  const [menu, setMenu] = useState<{ open: boolean; x: number; y: number; cat?: CategoryItem }>({
    open: false,
    x: 0,
    y: 0,
  });
  const [renaming, setRenaming] = useState<CategoryItem | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CategoryItem | null>(null);
  const [rowMenu, setRowMenu] = useState<{
    open: boolean;
    x: number;
    y: number;
    conv?: Conversation;
  }>({ open: false, x: 0, y: 0 });
  /** 被右键的会话 row / 分组 row 临时高亮 key,菜单关闭时清空(对齐老仓
   * selectConversationWrap 模式)。 */
  const [ctxMenuRowKey, setCtxMenuRowKey] = useState<string | null>(null);
  const [ctxMenuCatId, setCtxMenuCatId] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState<Conversation | null>(null);
  const [createInCategory, setCreateInCategory] = useState<string | null>(null);
  const [createCategoryOpen, setCreateCategoryOpen] = useState(false);
  // 右键"新建分组"时把当前 conv 记下,新分类建出后立即归入(对齐上游 8712d79e sub-5);
  // 顶部 "+ 新建分组"入口仍是 null(只建空分类)
  const [pendingFollowAction, setPendingFollowAction] = useState<Conversation | null>(null);

  /**
   * 用户主动操作(follow CRUD / 排序 / 移动)后失效 categories + sidebar 两个
   * query。**不再**订阅 WK conversationListener 触发失效(issue #103):每条
   * 消息/未读变化都打 invalidate 会让两个端点在 server 初始化 burst 时被
   * 打多次 → 后端 rate limit 触发 429。categories 数据只由 mutation 改变,
   * sidebar item.unread 字段没有 UI 消费(unread 徽标来自 SDK conv 本地缓存),
   * listener 全量监听 100% 浪费 + 触发 429。
   */
  const invalidateAll = () => {
    void qc.invalidateQueries({ queryKey: categoriesQueryKey(spaceId) });
    void qc.invalidateQueries({ queryKey: sidebarFollowQueryKey(spaceId) });
  };

  const renameMu = useMutation({
    mutationFn: (args: { catId: string; name: string }) => {
      if (!spaceId) return Promise.reject(new Error(t("followList.error.noSpaceId")));
      return renameCategory(spaceId, args.catId, args.name);
    },
    onSuccess: () => {
      invalidateAll();
      setRenaming(null);
      toast.success(t("followList.toast.renamed"));
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("followList.toast.renameFailed")),
  });

  const deleteMu = useMutation({
    mutationFn: (catId: string) => {
      if (!spaceId) return Promise.reject(new Error(t("followList.error.noSpaceId")));
      return deleteCategory(spaceId, catId);
    },
    onSuccess: () => {
      invalidateAll();
      setConfirmDelete(null);
      toast.success(t("followList.toast.deleted"));
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("followList.toast.deleteFailed")),
  });

  const { clearUnreadMu, muteMu, clearMessagesMu, unfollowMu } = useConversationActions({
    scope: "followList",
    onClearUnreadSuccess: invalidateAll,
    onClearMessagesSuccess: () => setConfirmClear(null),
    onUnfollowSuccess: () => {
      invalidateAll();
    },
  });

  const createCategoryMu = useMutation({
    mutationFn: (name: string) => {
      if (!spaceId) return Promise.reject(new Error(t("followList.error.noSpaceId")));
      return createCategory(spaceId, name.trim());
    },
    onSuccess: (category) => {
      // 如果是右键 conv 触发的"新建分组",新分类建出后立即归入(对齐上游 8712d79e sub-5):
      // group → moveGroupToCategory,DM → moveDmToCategory,thread 暂不支持(上游也只覆盖 group/DM)
      const pendingConv = pendingFollowAction;
      if (pendingConv && category.category_id) {
        const tp = pendingConv.channel.channelType;
        if (tp === ChannelTypeGroup) {
          moveGroupMu.mutate({
            groupNo: pendingConv.channel.channelID,
            categoryId: category.category_id,
          });
        } else if (tp === ChannelTypePerson) {
          moveDmMu.mutate({
            peerUid: pendingConv.channel.channelID,
            categoryId: category.category_id,
          });
        }
      }
      setPendingFollowAction(null);
      invalidateAll();
      setCreateCategoryOpen(false);
      toast.success(t("followList.toast.categoryCreated"));
    },
    onError: (err) => {
      setPendingFollowAction(null);
      toast.error(err instanceof Error ? err.message : t("followList.toast.createCategoryFailed"));
    },
  });

  const onCategoryContextMenu = (cat: CategoryItem) => (e: MouseEvent) => {
    if (cat.is_default) return;
    e.preventDefault();
    setCtxMenuCatId(cat.category_id ?? null);
    setMenu({ open: true, x: e.clientX, y: e.clientY, cat });
  };

  const handleRowContextMenu = (channel: Channel) => (e: MouseEvent) => {
    e.preventDefault();
    const conv =
      findConv(channel.channelID, channel.channelType) ??
      WKSDK.shared().conversationManager.findConversation(channel);
    if (!conv) return;
    setCtxMenuRowKey(`${channel.channelType}::${channel.channelID}`);
    setRowMenu({ open: true, x: e.clientX, y: e.clientY, conv });
  };

  const closeCategoryMenu = () => {
    setMenu((m) => ({ ...m, open: false }));
    setCtxMenuCatId(null);
  };
  const closeRowMenu = () => {
    setRowMenu((m) => ({ ...m, open: false }));
    setCtxMenuRowKey(null);
  };

  const handleSelectGroup = (groupNo: string) => {
    if (!onSelect) return;
    const cached = findConv(groupNo, ChannelTypeGroup);
    if (cached) {
      onSelect(cached);
      return;
    }
    const channel = new Channel(groupNo, ChannelTypeGroup);
    void WKSDK.shared().channelManager.fetchChannelInfo(channel);
    onSelect({ channel, channelInfo: undefined } as unknown as Conversation);
  };

  const handleSelectDM = (peerUid: string) => {
    if (!onSelect) return;
    const cached = findConv(peerUid, ChannelTypePerson);
    if (cached) {
      onSelect(cached);
      return;
    }
    const channel = new Channel(peerUid, ChannelTypePerson);
    void WKSDK.shared().channelManager.fetchChannelInfo(channel);
    onSelect({ channel, channelInfo: undefined } as unknown as Conversation);
  };

  const handleSelectThread = (threadChannelId: string) => {
    if (!onSelect) return;
    const cached = findConv(threadChannelId, CHANNEL_TYPE_THREAD);
    if (cached) {
      onSelect(cached);
      return;
    }
    const channel = new Channel(threadChannelId, CHANNEL_TYPE_THREAD);
    void WKSDK.shared().channelManager.fetchChannelInfo(channel);
    onSelect({ channel, channelInfo: undefined } as unknown as Conversation);
  };

  const followedThreadsByParent = useMemo(() => {
    if (!sidebarQ.data) return new Map<string, Conversation[]>();
    return buildFollowedThreadsByParent(conversationsQ.data ?? [], sidebarQ.data);
  }, [conversationsQ.data, sidebarQ.data]);

  const threadSidebarStatus = useMemo(
    () => buildThreadSidebarStatus(sidebarQ.data?.items ?? []),
    [sidebarQ.data?.items],
  );

  const orderedCategories = useMemo<CategoryItem[]>(() => {
    const cats = categoriesQ.data ?? [];
    return cats.filter((c) => !c.is_default);
  }, [categoriesQ.data]);

  const findCurrentCategoryId = (conv: Conversation): string | undefined => {
    const items = sidebarQ.data?.items ?? [];
    const tp = conv.channel.channelType;
    let targetType: number;
    if (tp === ChannelTypeGroup) targetType = SidebarTargetType.CHANNEL;
    else if (tp === ChannelTypePerson) targetType = SidebarTargetType.DM;
    else return undefined;
    const hit = items.find(
      (it) => it.target_type === targetType && it.target_id === conv.channel.channelID,
    );
    return hit?.category_id ?? undefined;
  };

  const buildRowMenuItems = (conv: Conversation): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [];
    const isMuted = !!conv.channelInfo?.mute;
    const isGroup = conv.channel.channelType === ChannelTypeGroup;
    const isDM = conv.channel.channelType === ChannelTypePerson;
    const isThread = conv.channel.channelType === CHANNEL_TYPE_THREAD;

    if (conv.unread > 0) {
      items.push({
        label: t("followList.menu.markRead"),
        icon: <Eye size={13} />,
        onClick: () => clearUnreadMu.mutate(conv),
      });
    }

    items.push({
      label: t("followList.menu.unfollow"),
      icon: <Star size={13} />,
      onClick: () => unfollowMu.mutate(conv),
    });

    if ((isGroup || isDM) && orderedCategories.length > 0) {
      const currentCatId = findCurrentCategoryId(conv);
      const moveTargets = orderedCategories.filter(
        (c) => !!c.category_id && c.category_id !== currentCatId,
      );
      const children: ContextMenuItem[] = moveTargets.map((cat) => ({
        label: cat.name,
        onClick: () => {
          if (!cat.category_id) return;
          if (isGroup) {
            moveGroupMu.mutate({
              groupNo: conv.channel.channelID,
              categoryId: cat.category_id,
            });
          } else {
            moveDmMu.mutate({
              peerUid: conv.channel.channelID,
              categoryId: cat.category_id,
            });
          }
        },
      }));
      children.push({ separator: true });
      children.push({
        label: t("followList.menu.newCategory"),
        onClick: () => {
          // 把右键 conv 带到 createCategoryMu.onSuccess,新分类建出后立即归入
          setPendingFollowAction(conv);
          setCreateCategoryOpen(true);
        },
      });
      items.push({
        label: t("followList.menu.moveToCategory"),
        icon: <FolderInput size={13} />,
        children,
      });
    }

    items.push({
      label: isMuted ? t("followList.menu.unmute") : t("followList.menu.mute"),
      icon: isMuted ? <BellRing size={13} /> : <BellOff size={13} />,
      onClick: () => muteMu.mutate({ conv, mute: !isMuted }),
    });

    if (isGroup) {
      const groupNo = conv.channel.channelID;
      // 右键"展开/收起子区"也按可见子区(非归档)算
      const hasThreads =
        filterArchivedThreads(followedThreadsByParent.get(groupNo) ?? [], threadSidebarStatus)
          .length > 0;
      if (hasThreads) {
        const expanded = isExpanded(groupNo);
        items.push({
          label: expanded
            ? t("followList.menu.collapseThreads")
            : t("followList.menu.expandThreads"),
          icon: <ThreadIcon size={13} />,
          onClick: () => toggleExpand(groupNo),
        });
      }
    }

    items.push({ separator: true });

    const clearItem: ContextMenuItem = {
      label: t("followList.menu.clearMessages"),
      icon: <Trash2 size={13} />,
      danger: true,
      onClick: () => setConfirmClear(conv),
    };
    if (isThread) {
      items.push(clearItem);
    } else {
      items.push({
        label: t("followList.menu.more"),
        icon: <MoreHorizontal size={13} />,
        children: [clearItem],
      });
    }

    return items;
  };

  const buildCategoryMenuItems = (cat: CategoryItem): ContextMenuItem[] => {
    const idx = orderedCategories.findIndex((c) => c.category_id === cat.category_id);
    const canUp = idx > 0;
    const canDown = idx >= 0 && idx < orderedCategories.length - 1;

    const submitSort = (newOrder: CategoryItem[]) => {
      const visibleIds = newOrder.map((c) => c.category_id).filter((x): x is string => !!x);
      const hiddenDefaultIds = (categoriesQ.data ?? [])
        .filter((c) => c.is_default && !!c.category_id && !visibleIds.includes(c.category_id))
        .map((c) => c.category_id!)
        .filter((id): id is string => !!id);
      sortCategoriesMu.mutate([...visibleIds, ...hiddenDefaultIds]);
    };

    return [
      {
        label: t("followList.catMenu.newGroup"),
        icon: <Plus size={13} />,
        onClick: () => {
          if (cat.category_id) setCreateInCategory(cat.category_id);
        },
      },
      { separator: true },
      {
        label: t("followList.catMenu.rename"),
        icon: <Pencil size={13} />,
        onClick: () => setRenaming(cat),
      },
      {
        label: t("followList.catMenu.moveUp"),
        icon: <ArrowUp size={13} />,
        disabled: !canUp,
        onClick: () => {
          if (!canUp) return;
          submitSort(arrayMove(orderedCategories, idx, idx - 1));
        },
      },
      {
        label: t("followList.catMenu.moveDown"),
        icon: <ArrowDown size={13} />,
        disabled: !canDown,
        onClick: () => {
          if (!canDown) return;
          submitSort(arrayMove(orderedCategories, idx, idx + 1));
        },
      },
      { separator: true },
      {
        label: t("followList.catMenu.deleteCategory"),
        icon: <Trash2 size={13} />,
        danger: true,
        onClick: () => setConfirmDelete(cat),
      },
    ];
  };

  if (categoriesQ.isLoading || sidebarQ.isLoading) {
    return (
      <div className="flex flex-1 flex-col gap-1 px-2 py-1">
        <style>{SKELETON_STYLE}</style>
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    );
  }
  if (categoriesQ.error || sidebarQ.error) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-error">
        {tt("followList.loadFailed")}
      </div>
    );
  }

  const sidebarHasItems = (sidebarQ.data?.items.length ?? 0) > 0;

  if (orderedCategories.length === 0 && !sidebarHasItems) {
    const hasNoGroups = (conversationsQ.data ?? []).every(
      (c) => c.channel.channelType !== ChannelTypeGroup,
    );
    return (
      <FollowEmptyState
        noGroups={hasNoGroups}
        onCreateCategory={onCreateCategory ?? (() => {})}
        onStartGroup={onStartGroup}
      />
    );
  }

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;

    const activeStr = String(active.id);
    const overStr = String(over.id);
    if (activeStr.startsWith("cat::") && overStr.startsWith("cat::")) {
      const aId = activeStr.slice("cat::".length);
      const oId = overStr.slice("cat::".length);
      const oldIndex = orderedCategories.findIndex((c) => (c.category_id ?? "default") === aId);
      const newIndex = orderedCategories.findIndex((c) => (c.category_id ?? "default") === oId);
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        const newOrder = arrayMove(orderedCategories, oldIndex, newIndex);
        const visibleIds = newOrder.map((c) => c.category_id).filter((x): x is string => !!x);
        const hiddenDefaultIds = (categoriesQ.data ?? [])
          .filter((c) => c.is_default && !!c.category_id && !visibleIds.includes(c.category_id))
          .map((c) => c.category_id!)
          .filter((id): id is string => !!id);
        sortCategoriesMu.mutate([...visibleIds, ...hiddenDefaultIds]);
      }
      return;
    }

    const activeParsed = parseDragId(activeStr);
    if (!activeParsed) return;
    const items = sidebarQ.data?.items ?? [];
    const activeItem = items.find(
      (it) => it.target_type === activeParsed.targetType && it.target_id === activeParsed.targetId,
    );
    if (!activeItem) return;
    const activeCatId = activeItem.category_id ?? "";

    const doMove = (targetCatId: string | null) => {
      if ((targetCatId ?? "") === activeCatId) return;
      if (activeParsed.targetType === SidebarTargetType.CHANNEL) {
        if (!targetCatId) return;
        moveGroupMu.mutate({ groupNo: activeParsed.targetId, categoryId: targetCatId });
      } else if (activeParsed.targetType === SidebarTargetType.DM) {
        moveDmMu.mutate({ peerUid: activeParsed.targetId, categoryId: targetCatId });
      }
    };

    const overIdStr = String(over.id);
    if (overIdStr.startsWith("drop::cat::") || overIdStr.startsWith("cat::")) {
      const prefix = overIdStr.startsWith("drop::cat::") ? "drop::cat::" : "cat::";
      const catIdRaw = overIdStr.slice(prefix.length);
      doMove(catIdRaw === "default" ? null : catIdRaw);
      return;
    }

    const overParsed = parseDragId(overIdStr);
    if (!overParsed) return;
    const overItem = items.find(
      (it) => it.target_type === overParsed.targetType && it.target_id === overParsed.targetId,
    );
    if (!overItem) return;
    const overCatId = overItem.category_id ?? "";

    if (activeCatId !== overCatId) {
      doMove(overItem.category_id ?? null);
      return;
    }

    const catList = sidebarQ.data?.itemsByCategory.get(activeCatId) ?? [];
    const draggable = catList.filter(
      (it) =>
        it.target_type === SidebarTargetType.CHANNEL || it.target_type === SidebarTargetType.DM,
    );
    const oldIndex = draggable.findIndex(
      (it) => it.target_type === activeParsed.targetType && it.target_id === activeParsed.targetId,
    );
    const newIndex = draggable.findIndex(
      (it) => it.target_type === overParsed.targetType && it.target_id === overParsed.targetId,
    );
    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;
    const reordered = arrayMove(draggable, oldIndex, newIndex);
    const orderedTargets = reordered.map((it) => ({
      target_type: it.target_type,
      target_id: it.target_id,
    }));
    const threadsByGroup = new Map<string, { channelID: string }[]>();
    for (const [parentGroupNo, threads] of followedThreadsByParent) {
      threadsByGroup.set(
        parentGroupNo,
        threads.map((th) => ({ channelID: th.channel.channelID })),
      );
    }
    sortCategory(activeCatId, sidebarQ.data?.followVersion ?? 0, orderedTargets, threadsByGroup);
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragCancel={handleDragCancel}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-1 flex-col overflow-y-auto px-2 py-1">
        <SortableContext
          items={orderedCategories.map((c) => `cat::${c.category_id ?? "default"}`)}
          strategy={verticalListSortingStrategy}
        >
          {orderedCategories.map((cat) => {
            const sidebarKey = cat.category_id ?? "";
            const sidebarItems = sidebarQ.data?.itemsByCategory.get(sidebarKey) ?? [];
            return (
              <CategorySection
                key={cat.category_id ?? `default-${cat.name}`}
                category={cat}
                collapsed={!!collapsed[cat.category_id ?? "default"]}
                onToggle={() => toggleCollapse(cat.category_id ?? "default")}
                onContextMenu={onCategoryContextMenu(cat)}
                ctxMenuActive={ctxMenuCatId === (cat.category_id ?? null)}
                sidebarItems={sidebarItems}
                followedThreadsByParent={followedThreadsByParent}
                threadSidebarStatus={threadSidebarStatus}
                selectedChannelId={selectedChannelId}
                ctxMenuRowKey={ctxMenuRowKey}
                myUid={myUid}
                isExpanded={isExpanded}
                onToggleExpand={toggleExpand}
                onSelectGroup={handleSelectGroup}
                onSelectDM={handleSelectDM}
                onSelectThread={handleSelectThread}
                onRowContextMenu={handleRowContextMenu}
              />
            );
          })}
        </SortableContext>

        {menu.open && menu.cat && menu.cat.category_id ? (
          <ContextMenu
            open
            x={menu.x}
            y={menu.y}
            items={buildCategoryMenuItems(menu.cat)}
            onClose={closeCategoryMenu}
          />
        ) : null}

        {rowMenu.open && rowMenu.conv ? (
          <ContextMenu
            open
            x={rowMenu.x}
            y={rowMenu.y}
            items={buildRowMenuItems(rowMenu.conv)}
            onClose={closeRowMenu}
          />
        ) : null}

        {renaming ? (
          <InputModal
            open
            title={tt("followList.renameCategoryTitle")}
            placeholder={tt("followList.renameCategoryPlaceholder")}
            initialValue={renaming.name}
            validate={(v) => v.trim().length > 0 && v.trim() !== renaming.name}
            okLoading={renameMu.isPending}
            onOk={(v) => {
              if (renaming.category_id) renameMu.mutate({ catId: renaming.category_id, name: v });
            }}
            onCancel={() => setRenaming(null)}
          />
        ) : null}

        {confirmDelete ? (
          <ConfirmModal
            open
            title={tt("followList.deleteCategoryTitle")}
            content={tt("followList.deleteCategoryContent", {
              values: { name: confirmDelete.name },
            })}
            okText={tt("followList.deleteOk")}
            okDanger
            okLoading={deleteMu.isPending}
            onOk={() => confirmDelete.category_id && deleteMu.mutate(confirmDelete.category_id)}
            onCancel={() => setConfirmDelete(null)}
          />
        ) : null}

        <ConfirmModal
          open={!!confirmClear}
          title={tt("followList.confirmClearTitle")}
          content={tt("followList.confirmClearContent")}
          okDanger
          okText={tt("followList.clearOk")}
          okLoading={clearMessagesMu.isPending}
          onOk={() => confirmClear && clearMessagesMu.mutate(confirmClear)}
          onCancel={() => setConfirmClear(null)}
        />

        <CreateGroupModal
          open={!!createInCategory}
          onClose={() => setCreateInCategory(null)}
          categoryId={createInCategory ?? undefined}
        />

        {createCategoryOpen ? (
          <InputModal
            open
            title={tt("followList.newCategoryTitle")}
            placeholder={tt("followList.newCategoryPlaceholder")}
            validate={(v) => v.trim().length > 0}
            okLoading={createCategoryMu.isPending}
            onOk={(v) => createCategoryMu.mutate(v)}
            onCancel={() => {
              setPendingFollowAction(null);
              setCreateCategoryOpen(false);
            }}
          />
        ) : null}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeDragId
          ? renderDragGhost(activeDragId, orderedCategories, sidebarQ.data?.items ?? [])
          : null}
      </DragOverlay>
    </DndContext>
  );
}
