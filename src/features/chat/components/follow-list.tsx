import { type MouseEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Channel,
  ChannelTypeGroup,
  ChannelTypePerson,
  type Conversation,
  type ConversationAction,
} from "wukongimjssdk";
import WKSDK from "wukongimjssdk";
import { BellOff, ChevronDown, ChevronRight, Hash, Pencil, Trash2 } from "lucide-react";
import { authStore } from "@/features/base/stores/auth";
import { spaceStore } from "@/features/base/stores/space";
import { toast } from "@/components/semi-bridge/toast";
import { ContextMenu, type ContextMenuItem } from "@/features/base/components/context-menu";
import { ConfirmModal } from "@/features/base/components/modals/confirm-modal";
import { InputModal } from "@/features/base/components/modals/input-modal";
import { parseThreadChannelId } from "@/features/base/im/parse-thread-channel-id";
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
import {
  type CategoryItem,
  deleteCategory,
  followDM,
  moveGroupToCategory,
  renameCategory,
} from "@/features/base/api/endpoints/follow.api";
import { type SidebarItem, SidebarTargetType } from "@/features/base/api/endpoints/sidebar.api";
import { useSortFollow } from "@/features/chat/hooks/use-sort-follow.hook";

interface FollowListProps {
  selectedChannelId?: string;
  onSelect?: (c: Conversation) => void;
}

const CHANNEL_TYPE_THREAD = 5;

/**
 * SDK conversationManager 推送时:
 * - 让 categoriesQuery 重拉(分组里 group_count / 群名变化)
 * - 让 sidebarFollowQuery 重拉(unread / timestamp 变化反映到关注 tab)
 */
function useSyncOnConversationChange(invalidate: () => void) {
  useEffect(() => {
    const cm = WKSDK.shared().conversationManager;
    const listener = (_c: Conversation, _a: ConversationAction) => {
      invalidate();
    };
    cm.addConversationListener(listener);
    return () => cm.removeConversationListener(listener);
  }, [invalidate]);
}

/**
 * 父群 groupNo → 该群下"已关注"子区列表(对齐旧 followedChildThreadsByParent 三路合并):
 *
 * 1. **sidebar `parent_channel_id` 是权威源** — 后端给的反挂指针,不依赖 IM SDK ID 解析
 *    单纯 parseThreadChannelId 在子区 ID 编码迁移过的场景下会把子区挂到错误父群上(实测
 *    表现:DM3.0 产研群下的子区跑到 文件传输助手 下);必须以 sidebar 的 parent_channel_id 为准
 * 2. IM cache 里已关注的子区 → parent 取自 sidebar 反查表;sidebar 没给的 fallback 到
 *    channelInfo.orgData.parentGroupNo,再 fallback 到 parseThreadChannelId
 * 3. sidebar 给但 IM 缓存还没拉到的子区(冷启 / 新关注),合成最小占位 conv,channelInfo
 *    异步补齐由 useConversationsSync 的 channelInfoListener 触发重渲。
 */
function buildFollowedThreadsByParent(
  conversations: Conversation[],
  derived: SidebarFollowDerived,
): Map<string, Conversation[]> {
  const { followedKeys, items } = derived;
  const map = new Map<string, Conversation[]>();

  // (1) sidebar 反查表:thread channelID → parent_channel_id(权威)
  const threadParentFromSidebar = new Map<string, string>();
  for (const it of items) {
    if (it.target_type !== SidebarTargetType.THREAD) continue;
    if (!it.parent_channel_id) continue;
    threadParentFromSidebar.set(it.target_id, it.parent_channel_id);
  }

  const seen = new Set<string>();

  // (2) IM cache 里已关注的子区:用 sidebar 反查表 → orgData.parentGroupNo → parseThreadChannelId
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

  // (3) sidebar 给但 IM 缓存里没的子区:合成 stub conv 挂到 parent 下。
  //     parent 优先 sidebar 的 parent_channel_id;没给时用 parseThreadChannelId 兜底
  //     (旧后端在某些场景下不返 parent_channel_id,只靠 channelID 编码反查父群)
  for (const it of items) {
    if (it.target_type !== SidebarTargetType.THREAD) continue;
    if (seen.has(it.target_id)) continue;
    const parent = it.parent_channel_id ?? parseThreadChannelId(it.target_id)?.groupNo ?? undefined;
    if (!parent) continue;
    const channel = new Channel(it.target_id, CHANNEL_TYPE_THREAD);
    void WKSDK.shared().channelManager.fetchChannelInfo(channel);
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

  // 子区组内按 timestamp 倒序(关注 tab 父群外层走 follow_sort,内层子区按时间序)
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

/**
 * 拖拽 sort id 约定:`item::${target_type}::${target_id}` — 跟老仓
 * ConversationListGrouped 行 429 同款,handleDragEnd 解析 active/over.id 反向。
 * thread 行不可拖,不进 SortableContext.items 也不包 SortableRow。
 */
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
 * 单个可拖 row 容器 — 用 useSortable 包 group/dm row(thread 不包,跟随父群)。
 *
 * **关键**:listeners 只透传给 children 的 drag handle(老仓 wk-conv-compact-drag-handle
 * hover 才显的小 6 点),不挂整 row — 否则整行可拖,点击/选中冲突。
 * children 是 render-prop:(dragProps) => ReactNode,dragProps 用 {...} 散到 handle span 上。
 */
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

/**
 * 6 点 grip 拖拽手柄(对齐老仓 wk-conv-compact-drag-handle,默认 opacity 0,
 * group/dm row hover 时 opacity 1 + pointer-events auto;点击 stopPropagation 防选中)。
 *
 * 通过 CSS group hover 联动 — 调用方在 row 上加 `group/row`,handle 用 `opacity-0
 * group-hover/row:opacity-100`。
 */
function DragHandle({ attributes, listeners }: DragProps) {
  return (
    <span
      {...attributes}
      {...listeners}
      onClick={(e) => e.stopPropagation()}
      className="-ml-1 flex h-5 w-3.5 shrink-0 cursor-grab items-center justify-center text-text-tertiary opacity-0 transition-opacity duration-150 group-hover/row:opacity-100 active:cursor-grabbing"
      aria-label="拖动排序"
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

/** 列表骨架行(对齐老仓 wk-conv-compact-name-skeleton shimmer 动画,加载中占位) */
function SkeletonRow() {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5">
      <span className="skeleton-shimmer h-[22px] w-[22px] shrink-0 rounded-[5px]" />
      <span className="skeleton-shimmer h-3 w-24 rounded-sm" />
    </div>
  );
}

/** 全局 skeleton shimmer 样式(对齐老仓 @keyframes wk-skeleton-shimmer 1.2s 渐变扫光) */
const SKELETON_STYLE = `
.skeleton-shimmer {
  background: linear-gradient(90deg,
    rgba(46,50,56,0.06) 25%,
    rgba(46,50,56,0.12) 50%,
    rgba(46,50,56,0.06) 75%);
  background-size: 200% 100%;
  animation: wk-skeleton-shimmer 1.2s infinite linear;
}
@keyframes wk-skeleton-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
`;

interface CompactRowProps {
  /** 'group' = 群行(渲染头像),'dm' = DM 行(渲染头像,圆形),'thread' = 子区行(# 图标) */
  variant: "group" | "dm" | "thread";
  channel: Channel;
  title: string;
  unread: number;
  isMuted: boolean;
  /** @我 提及态(对齐老仓 wk-mention-badge,行 175-177:icon 后紧贴的紫红 @我) */
  isMentionMe?: boolean;
  /** 外部群标(对齐老仓 wk-conv-compact-external-badge,行 187-192:name 后紫底 "外部") */
  isExternal?: boolean;
  /** 父群行末尾子区指示图标 + 切换展开按钮(仅 variant=group 有意义) */
  hasThreads?: boolean;
  threadsExpanded?: boolean;
  onToggleThreads?: () => void;
  selected: boolean;
  onClick: () => void;
}

/**
 * Compact 行(1:1 对齐老仓 .wk-conv-compact-item):
 *
 * 布局(老仓 CSS 行 430-453):
 *   - padding 5px 8px / min-h 30px / rounded-xs / gap 8px / position relative
 *   - selected:bg rgba(28,28,35,0.06)(老仓 brand-tint-06)
 *   - hover(非 selected):bg rgba(46,50,56,0.09)(老仓 bg-item-hover)
 *
 * 头像(老仓 wk-conv-compact-icon):
 *   - container 22×22
 *   - group avatar 5px 圆角矩形 / DM avatar 圆形(由 ChannelAvatar 自带 rounded-full 决定)
 *   - 子区:14×14 Hash icon(.wk-conv-compact-item--thread .wk-conv-compact-icon)
 *
 * **未读 reddot**(老仓 wk-conv-compact-icon--reddot::after,有未读时):
 *   icon 左上角 6×6 红圆点(1px white border),不论静音都显
 *
 * 名字(wk-conv-compact-name):
 *   - text-size-base 14px / weight 500;未读时 weight 600
 *   - 子区:weight 400 / 灰色;未读子区 weight 500 / 强色
 *   - **titleLoading=true 时显 shimmer skeleton 占位条**(老仓 wk-conv-compact-name-skeleton)
 *
 * 右侧装饰:
 *   - @我 紫红 badge(unread > 0 && !muted)
 *   - 外部群 紫底 "外部" badge
 *   - 静音 BellOff icon
 *   - 未读 badge(rounded-full 16×16,bg-error/15 淡红底 + text-error;静音用红点)
 *   - 父群 thread-tag(展开/收起子区按钮)
 *
 * 子区行(thread):padding-left 36px / min-h 26px / gap 6px(深缩进对齐父群头像下方)
 *
 * dragProps:由 SortableRow 透传,挂在 DragHandle 上(hover 时显)— 仅 group/dm 有,thread null
 */
interface CompactRowProps2 extends CompactRowProps {
  /** channelInfo 异步未拉到时 title=channelID 兜底,UI 显 shimmer 骨架代替 raw channelID */
  titleLoading?: boolean;
  /** group/dm 可拖,thread 不可拖(thread 跟随父群)— 传 null 不渲 handle */
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
}: CompactRowProps2) {
  const hasUnread = unread > 0;
  const isThread = variant === "thread";
  const onThreadTagClick = (e: MouseEvent) => {
    e.stopPropagation();
    onToggleThreads?.();
  };
  // 老仓 selected bg = brand-tint-06(6%),hover bg = bg-item-hover(9%);精确像素值
  const bgClass = selected ? "bg-[rgba(28,28,35,0.06)]" : "hover:bg-[rgba(46,50,56,0.09)]";
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={`group/row relative flex w-full cursor-pointer items-center gap-2 rounded-[4px] px-2 text-left transition-colors duration-120 ${bgClass} ${
        isThread ? "min-h-[26px] py-[3px] pl-9 gap-1.5" : "min-h-[30px] py-[5px]"
      }`}
    >
      {/* drag handle:仅 group/dm,thread 不渲 */}
      {dragProps ? <DragHandle {...dragProps} /> : null}

      {/* icon container 22×22(子区 14×14) + 左上 6×6 reddot(未读时) */}
      <span
        className={`relative flex shrink-0 items-center justify-center ${
          isThread
            ? "h-[14px] w-[14px] text-text-tertiary"
            : "h-[22px] w-[22px] text-text-secondary"
        }`}
      >
        {isThread ? (
          <Hash size={14} />
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

      {/* 名字 — titleLoading 时 shimmer 骨架(老仓 wk-conv-compact-name-skeleton 80×12) */}
      {titleLoading ? (
        <span className="skeleton-shimmer h-[12px] w-[80px] shrink-[1000] rounded-sm" aria-hidden />
      ) : (
        <span
          className={`min-w-0 flex-1 truncate text-sm leading-[1.4] ${
            isThread
              ? hasUnread && !isMuted
                ? "font-medium text-text-primary"
                : "font-normal text-text-secondary"
              : isMuted
                ? "text-text-tertiary"
                : "text-text-primary"
          } ${hasUnread && !isMuted && !isThread ? "font-semibold" : ""}`}
        >
          {title}
        </span>
      )}

      {/* 装饰 — 外部 / @我 / 静音 / 未读 badge / thread-tag */}
      {isExternal ? (
        <span
          aria-label="外部群"
          className="shrink-0 rounded-sm bg-brand-tint px-1 text-[10px] font-medium text-text-secondary"
        >
          外部
        </span>
      ) : null}
      {isMentionMe && hasUnread && !isMuted ? (
        <span className="shrink-0 rounded-sm bg-error px-1 text-[10px] font-semibold text-text-inverse">
          @我
        </span>
      ) : null}
      {isMuted ? (
        <BellOff size={11} aria-label="免打扰" className="shrink-0 text-text-tertiary" />
      ) : null}
      {hasUnread && !isMuted ? (
        <span
          aria-label={`${unread} 条未读`}
          className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-error/15 px-1 text-[10px] font-semibold leading-none text-error"
        >
          {unreadBadge(unread)}
        </span>
      ) : null}
      {hasUnread && isMuted ? (
        <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-error" />
      ) : null}
      {hasThreads ? (
        <span
          role="button"
          tabIndex={0}
          aria-label={threadsExpanded ? "收起子区" : "展开子区"}
          title={threadsExpanded ? "收起子区" : "展开子区"}
          onClick={onThreadTagClick}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              onToggleThreads?.();
            }
          }}
          className={`ml-0.5 flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-[4px] text-accent opacity-85 transition-all ${
            threadsExpanded ? "bg-accent/12" : "hover:bg-accent/12 hover:opacity-100"
          }`}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M12 2.81a1 1 0 0 1 0-1.41l.36-.36a1 1 0 0 1 1.41 0l9.2 9.2a1 1 0 0 1 0 1.4l-.7.7a1 1 0 0 1-1.3.13l-9.54-6.72a1 1 0 0 1-.08-1.58l1-1L12 2.8ZM12 21.2a1 1 0 0 1 0 1.41l-.35.35a1 1 0 0 1-1.41 0l-9.2-9.19a1 1 0 0 1 0-1.41l.7-.7a1 1 0 0 1 1.3-.12l9.54 6.72a1 1 0 0 1 .07 1.58l-1 1 .35.36ZM15.66 16.8a1 1 0 0 1-1.38.28l-8.49-5.66A1 1 0 1 1 6.9 9.76l8.49 5.65a1 1 0 0 1 .27 1.39ZM17.1 14.25a1 1 0 1 0 1.11-1.66L9.73 6.93a1 1 0 0 0-1.11 1.66l8.49 5.66Z" />
          </svg>
        </span>
      ) : null}
    </div>
  );
}

/** 子区静音继承:显式自身设置看自身,未设置时继承父群(对齐旧 isEffectivelyMuted)。 */
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

/** 折叠状态下父群聚合的子区未读(过滤静音子区,对齐旧 threadUnread 计算)。 */
function aggregateThreadUnread(threads: Conversation[], parentGroupNo: string): number {
  return threads.reduce((sum, t) => {
    if (isThreadEffectivelyMuted(t, parentGroupNo)) return sum;
    return sum + (t.unread || 0);
  }, 0);
}

interface CategorySectionProps {
  category: CategoryItem;
  collapsed: boolean;
  onToggle: () => void;
  onContextMenu: (e: MouseEvent) => void;
  /** 该 category 下的 sidebar items(已按 follow_sort ASC 排) */
  sidebarItems: SidebarItem[];
  followedThreadsByParent: Map<string, Conversation[]>;
  selectedChannelId?: string;
  /** 当前登录用户 uid — isMentionMe 计算用(reminders + mention.uids includes myUid) */
  myUid: string;
  isExpanded: (groupId: string) => boolean;
  onToggleExpand: (groupId: string) => void;
  onSelectGroup: (groupNo: string) => void;
  onSelectDM: (peerUid: string) => void;
  onSelectThread: (threadChannelId: string) => void;
}

/** 单个分组 section(折叠/展开 + 右键菜单) */
function CategorySection({
  category,
  collapsed,
  onToggle,
  onContextMenu,
  sidebarItems,
  followedThreadsByParent,
  selectedChannelId,
  myUid,
  isExpanded,
  onToggleExpand,
  onSelectGroup,
  onSelectDM,
  onSelectThread,
}: CategorySectionProps) {
  const [expandedThreadsSet, setExpandedThreadsSet] = useState<Set<string>>(new Set());
  const count = sidebarItems.length;

  // **Dedup**:已嵌入在某个父群下渲染过的子区 channelID 集合,避免 target_type=5 standalone
  // 路径再渲染一次(对齐旧 ConversationListGrouped 的 seenIds:`${type}::${id}` 去重)。
  // 派生自 followedThreadsByParent;props 不变时引用稳定。
  const nestedThreadIds = useMemo(() => {
    const s = new Set<string>();
    for (const arr of followedThreadsByParent.values()) {
      for (const t of arr) s.add(t.channel.channelID);
    }
    return s;
  }, [followedThreadsByParent]);

  // 整个 section 注册为 drop 区(drop::cat::{id})— 跨分组拖拽 item 到这里触发 move
  // 对齐老仓 ConversationListGrouped 行 233-237 `drop::cat::` 解析
  const dropId = `drop::cat::${category.category_id ?? "default"}`;
  const { setNodeRef: setDropRef, isOver: isDropOver } = useDroppable({ id: dropId });

  return (
    <section
      ref={setDropRef}
      className={`flex flex-col rounded-sm transition-colors ${isDropOver ? "bg-brand-tint/30" : ""}`}
    >
      <header
        className="flex cursor-pointer items-center gap-1 px-2 py-1.5 text-[12px] text-text-secondary transition-colors hover:bg-bg-hover"
        onClick={onToggle}
        onContextMenu={onContextMenu}
      >
        {collapsed ? (
          <ChevronRight size={12} className="shrink-0" />
        ) : (
          <ChevronDown size={12} className="shrink-0" />
        )}
        <span className="min-w-0 flex-1 truncate font-semibold">{category.name}</span>
        <span className="shrink-0 text-text-tertiary">{count}</span>
      </header>
      {!collapsed ? (
        <div className="flex flex-col">
          {count === 0 ? (
            <div className="px-3 py-2 text-[12px] text-text-tertiary">分组为空</div>
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
                <SortableContext items={draggableIds}>
                  {sidebarItems.map((it) => {
                    if (it.target_type === SidebarTargetType.CHANNEL) {
                      const groupNo = it.target_id;
                      const conv = findConv(groupNo, ChannelTypeGroup);
                      const channel = conv?.channel ?? new Channel(groupNo, ChannelTypeGroup);
                      const title =
                        conv?.channelInfo?.title ??
                        category.groups.find((g) => g.group_no === groupNo)?.name ??
                        groupNo;
                      const muted = !!conv?.channelInfo?.mute;
                      const threads = followedThreadsByParent.get(groupNo) ?? [];
                      const expanded = isExpanded(groupNo);
                      const groupUnread = conv?.unread ?? it.unread;
                      const aggThreadUnread = expanded
                        ? 0
                        : aggregateThreadUnread(threads, groupNo);
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
                                titleLoading={!conv?.channelInfo}
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
                                hasThreads={threads.length > 0}
                                threadsExpanded={expanded}
                                onToggleThreads={() => onToggleExpand(groupNo)}
                                selected={groupNo === selectedChannelId}
                                onClick={() => onSelectGroup(groupNo)}
                                dragProps={dragProps}
                              />
                              {expanded
                                ? (() => {
                                    const showAll = expandedThreadsSet.has(groupNo);
                                    const MAX = 5;
                                    const visible = showAll ? threads : threads.slice(0, MAX);
                                    const hidden = threads.length - visible.length;
                                    return (
                                      <>
                                        {visible.map((t) => (
                                          <CompactRow
                                            key={`thread-${t.channel.channelID}`}
                                            variant="thread"
                                            channel={t.channel}
                                            title={t.channelInfo?.title ?? t.channel.channelID}
                                            unread={t.unread || 0}
                                            isMuted={isThreadEffectivelyMuted(t, groupNo)}
                                            isMentionMe={computeMentionMe(t, myUid)}
                                            selected={t.channel.channelID === selectedChannelId}
                                            onClick={() => onSelectThread(t.channel.channelID)}
                                          />
                                        ))}
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
                                            查看更多 +{hidden}
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
                      const title = conv?.channelInfo?.title ?? peerUid;
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
                              titleLoading={!conv?.channelInfo}
                              unread={unread}
                              isMuted={muted}
                              isMentionMe={conv ? computeMentionMe(conv, myUid) : false}
                              selected={peerUid === selectedChannelId}
                              onClick={() => onSelectDM(peerUid)}
                              dragProps={dragProps}
                            />
                          )}
                        </SortableRow>
                      );
                    }
                    if (it.target_type === SidebarTargetType.THREAD) {
                      const tid = it.target_id;
                      // **dedup**:已嵌在某个父群下渲染过的子区,不再 standalone(对齐旧 seenIds)
                      if (nestedThreadIds.has(tid)) return null;
                      // 真孤儿子区(父群没关注 + sidebar 没 parent_channel_id + parseThreadChannelId
                      // 失败):平铺渲染,不嵌套
                      const conv = findConv(tid, CHANNEL_TYPE_THREAD);
                      const channel = conv?.channel ?? new Channel(tid, CHANNEL_TYPE_THREAD);
                      const title = conv?.channelInfo?.title ?? tid;
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
                          unread={unread}
                          isMuted={muted}
                          isMentionMe={conv ? computeMentionMe(conv, myUid) : false}
                          selected={tid === selectedChannelId}
                          onClick={() => onSelectThread(tid)}
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

/**
 * 关注 tab(对应旧 ConversationListWithCategory + ConversationListGrouped + ConversationList compact 模式)。
 *
 * **数据模型 1:1 对齐旧版**:
 * - **数据源**:/v1/sidebar/sync(tab=follow)给全量已关注 items + follow_version,/v1/spaces/{}/categories
 *   只用来取 category 名 / sort / is_default,**不**用 categories.groups 渲染(那只是关注关系的子集)
 * - **顺序**:按 follow_sort ASC,每 category 一桶;父群下嵌套子区按 timestamp 倒序
 * - **DM**:target_type=1 单独渲染 DM 行;**群 + 子区**:target_type=2 群行 + 嵌套已关注子区;
 *   **独立关注子区**:target_type=5 with no parent followed(罕见),平铺渲染
 * - **子区 parent**:用 sidebar 的 `parent_channel_id` 作为权威源(避免 parseThreadChannelId
 *   在子区 ID 编码迁移过的场景下挂到错误父群)
 *
 * **关键 React 集成**:
 * - useConversationsSync():订阅 SDK channelInfoListener,channelInfo 异步拉到后写回
 *   conversations cache,follow-list 读 query data 自动重渲(否则子区 / 群标题会一直是 raw channelID)
 * - useSyncOnConversationChange():conversations 推送时 invalidate sidebar 让 unread 即时跟上
 *
 * **子区展开**(对齐旧 ConversationList compact MAX_VISIBLE_THREADS=0):
 * - 默认全部折叠,父群行尾子区指示图标可点切换
 * - 折叠时父群 unread = 群自身 + 聚合非静音子区未读
 * - 状态 per-uid + per-spaceId 持久化到 localStorage
 */
export function FollowList({ selectedChannelId, onSelect }: FollowListProps) {
  const qc = useQueryClient();
  const spaceId = useStore(spaceStore, (s) => s.spaceId);
  const myUid = useStore(authStore, (s) => s.user?.uid ?? "");
  // 必须挂 channelInfoListener 让异步拉到的群/子区标题反映到列表(否则 e2787b... 之类的
  // raw channelID 会一直显示 — 旧 ConversationList 在 componentDidMount 挂 channelManager
  // listener 解决)。conversation-list 切到关注 tab 时不再 mount,所以 follow-list 自己挂。
  useConversationsSync();

  const categoriesQ = useQuery(categoriesQueryOptions(spaceId));
  const sidebarQ = useQuery(sidebarFollowQueryOptions(spaceId));
  const conversationsQ = useQuery(conversationsQueryOptions(spaceId));

  const { isExpanded, toggle: toggleExpand } = useExpandedGroupIds(myUid, spaceId);

  // 分组 collapsed 状态(本地,内存,刷新页面后重置)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggleCollapse = (id: string) => setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));

  // 拖拽排序(同分组 — group/dm 重排 by /follow/sort + version CAS)
  const { sortCategory } = useSortFollow(spaceId);
  // PointerSensor activation 距离 5px:防止单击误触拖拽(老仓 ConversationListGrouped 同款)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // 跨分组移动 — group 走 /follow/channel/move,DM 走 /follow/dm 覆盖式更新
  // 1:1 对齐老仓 ConversationListGrouped handleDragEnd 行 219-225 跨分组分支
  const moveGroupMu = useMutation({
    mutationFn: (args: { groupNo: string; categoryId: string }) =>
      moveGroupToCategory(args.groupNo, args.categoryId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: sidebarFollowQueryKey(spaceId) });
      void qc.invalidateQueries({ queryKey: categoriesQueryKey(spaceId) });
      toast.success("已移动到分组");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "移动失败");
      void qc.invalidateQueries({ queryKey: sidebarFollowQueryKey(spaceId) });
    },
  });
  const moveDmMu = useMutation({
    mutationFn: (args: { peerUid: string; categoryId: string | null }) =>
      followDM(args.peerUid, args.categoryId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: sidebarFollowQueryKey(spaceId) });
      toast.success("已移动 DM 到分组");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "移动失败");
      void qc.invalidateQueries({ queryKey: sidebarFollowQueryKey(spaceId) });
    },
  });

  const [menu, setMenu] = useState<{ open: boolean; x: number; y: number; cat?: CategoryItem }>({
    open: false,
    x: 0,
    y: 0,
  });
  const [renaming, setRenaming] = useState<CategoryItem | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CategoryItem | null>(null);

  const invalidateAll = () => {
    void qc.invalidateQueries({ queryKey: categoriesQueryKey(spaceId) });
    void qc.invalidateQueries({ queryKey: sidebarFollowQueryKey(spaceId) });
  };
  useSyncOnConversationChange(invalidateAll);

  const renameMu = useMutation({
    mutationFn: (args: { catId: string; name: string }) => {
      if (!spaceId) return Promise.reject(new Error("无 spaceId"));
      return renameCategory(spaceId, args.catId, args.name);
    },
    onSuccess: () => {
      invalidateAll();
      setRenaming(null);
      toast.success("已重命名");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "重命名失败"),
  });

  const deleteMu = useMutation({
    mutationFn: (catId: string) => {
      if (!spaceId) return Promise.reject(new Error("无 spaceId"));
      return deleteCategory(spaceId, catId);
    },
    onSuccess: () => {
      invalidateAll();
      setConfirmDelete(null);
      toast.success("已删除");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "删除失败"),
  });

  const onCategoryContextMenu = (cat: CategoryItem) => (e: MouseEvent) => {
    if (cat.is_default) return;
    e.preventDefault();
    setMenu({ open: true, x: e.clientX, y: e.clientY, cat });
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

  const orderedCategories = useMemo<CategoryItem[]>(() => {
    const cats = categoriesQ.data ?? [];
    const haveDefault = cats.some((c) => c.is_default);
    const sidebarItems = sidebarQ.data?.itemsByCategory.get("") ?? [];
    if (haveDefault || sidebarItems.length === 0) return cats;
    return [
      ...cats,
      {
        category_id: null,
        name: "默认分组",
        sort: Number.MAX_SAFE_INTEGER,
        groups: [],
        is_default: true,
      } as CategoryItem,
    ];
  }, [categoriesQ.data, sidebarQ.data]);

  if (categoriesQ.isLoading || sidebarQ.isLoading) {
    // 老仓 .wk-conv-compact-name-skeleton shimmer 占位行 — 比"加载分组…"文字更优雅
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
      <div className="flex flex-1 items-center justify-center text-sm text-error">分组加载失败</div>
    );
  }

  const sidebarHasItems = (sidebarQ.data?.items.length ?? 0) > 0;

  if (orderedCategories.length === 0 && !sidebarHasItems) {
    const hasNoGroups = (conversationsQ.data ?? []).every(
      (c) => c.channel.channelType !== ChannelTypeGroup,
    );
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
        <p className="text-sm text-text-secondary">
          {hasNoGroups ? "你还没有任何会话" : "你还没有关注任何会话"}
        </p>
        <p className="text-xs text-text-tertiary">
          {hasNoGroups ? "先去发起群聊吧" : "右上角 ➕ → 创建分组,把会话整理起来"}
        </p>
      </div>
    );
  }

  /**
   * 拖拽结束:三个分支(1:1 对齐老仓 ConversationListGrouped handleDragEnd 行 140-244):
   *
   *   分支 A — item → item 同 category:`/follow/sort` 同分组重排(群下面紧跟子区)
   *   分支 B — item → item 跨 category:按 over item 的 category 作目标
   *     · group → /follow/channel/move
   *     · dm    → /follow/dm 覆盖式更新(category_id)
   *     · thread 不跨分组(对齐老仓行 231:`if (channelType === ChannelTypeCommunityTopic) return`)
   *   分支 C — item → drop::cat::xxx(分组 header drop 区):同 B 但目标 categoryId 从 drop id 取
   *
   * 跨分组失败由各 mutation 的 onError invalidate sidebar 兜底回到服务端真值。
   */
  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const activeParsed = parseDragId(String(active.id));
    if (!activeParsed) return;
    const items = sidebarQ.data?.items ?? [];
    const activeItem = items.find(
      (it) => it.target_type === activeParsed.targetType && it.target_id === activeParsed.targetId,
    );
    if (!activeItem) return;
    const activeCatId = activeItem.category_id ?? "";

    // 共用 mover — 按 channelType 分流(thread 不跨,老仓行 231)
    const doMove = (targetCatId: string | null) => {
      if ((targetCatId ?? "") === activeCatId) return;
      if (activeParsed.targetType === SidebarTargetType.CHANNEL) {
        if (!targetCatId) return; // 群必须有目标 category
        moveGroupMu.mutate({ groupNo: activeParsed.targetId, categoryId: targetCatId });
      } else if (activeParsed.targetType === SidebarTargetType.DM) {
        moveDmMu.mutate({ peerUid: activeParsed.targetId, categoryId: targetCatId });
      }
    };

    // 分支 C:over 是 drop::cat::xxx
    const overIdStr = String(over.id);
    if (overIdStr.startsWith("drop::cat::")) {
      const catIdRaw = overIdStr.slice("drop::cat::".length);
      doMove(catIdRaw === "default" ? null : catIdRaw);
      return;
    }

    // 分支 A / B:over 是另一个 item
    const overParsed = parseDragId(overIdStr);
    if (!overParsed) return;
    const overItem = items.find(
      (it) => it.target_type === overParsed.targetType && it.target_id === overParsed.targetId,
    );
    if (!overItem) return;
    const overCatId = overItem.category_id ?? "";

    if (activeCatId !== overCatId) {
      // 分支 B:跨分组 — 目标 categoryId 取 over item 所属
      doMove(overItem.category_id ?? null);
      return;
    }

    // 分支 A:同分组重排
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
        threads.map((t) => ({ channelID: t.channel.channelID })),
      );
    }
    sortCategory(activeCatId, sidebarQ.data?.followVersion ?? 0, orderedTargets, threadsByGroup);
  };

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      {/* 对齐老仓 .wk-conversationlist:padding=0;新仓保留 px-2 py-1 让 selected bg 不贴边 */}
      <div className="flex flex-1 flex-col overflow-y-auto px-2 py-1">
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
              sidebarItems={sidebarItems}
              followedThreadsByParent={followedThreadsByParent}
              selectedChannelId={selectedChannelId}
              myUid={myUid}
              isExpanded={isExpanded}
              onToggleExpand={toggleExpand}
              onSelectGroup={handleSelectGroup}
              onSelectDM={handleSelectDM}
              onSelectThread={handleSelectThread}
            />
          );
        })}

        {menu.open && menu.cat && menu.cat.category_id ? (
          <ContextMenu
            open
            x={menu.x}
            y={menu.y}
            items={
              [
                {
                  label: "重命名",
                  icon: <Pencil size={13} />,
                  onClick: () => menu.cat && setRenaming(menu.cat),
                },
                {
                  label: "删除分组",
                  icon: <Trash2 size={13} />,
                  danger: true,
                  onClick: () => menu.cat && setConfirmDelete(menu.cat),
                },
              ] as ContextMenuItem[]
            }
            onClose={() => setMenu((m) => ({ ...m, open: false }))}
          />
        ) : null}

        {renaming ? (
          <InputModal
            open
            title="重命名分组"
            placeholder="输入新分组名"
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
            title="确认删除分组"
            content={`确定删除分组「${confirmDelete.name}」吗?分组内会话会取消关注。`}
            okText="删除"
            okDanger
            okLoading={deleteMu.isPending}
            onOk={() => confirmDelete.category_id && deleteMu.mutate(confirmDelete.category_id)}
            onCancel={() => setConfirmDelete(null)}
          />
        ) : null}
      </div>
    </DndContext>
  );
}
