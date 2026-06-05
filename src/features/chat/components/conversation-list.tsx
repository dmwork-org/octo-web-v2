import { useMemo, useState, type MouseEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import WKSDK, {
  Channel,
  type Conversation,
  ChannelTypeGroup,
  ChannelTypePerson,
} from "wukongimjssdk";
import { BellOff, BellRing, Eye, MoreHorizontal, Pin, PinOff, Star, Trash2, X } from "lucide-react";
import { authStore } from "@/features/base/stores/auth";
import { spaceStore } from "@/features/base/stores/space";
import { toast } from "@/components/semi-bridge/toast";
import { ContextMenu, type ContextMenuItem } from "@/features/base/components/context-menu";
import { ConfirmModal } from "@/features/base/components/modals/confirm-modal";
import { InputModal } from "@/features/base/components/modals/input-modal";
import { parseThreadChannelId } from "@/features/base/im/parse-thread-channel-id";
import {
  clearChannelMessages,
  clearConversationUnread,
  deleteConversation,
} from "@/features/base/api/endpoints/conversation.api";
import { setChannelMute, setChannelTop } from "@/features/base/api/endpoints/channel-setting.api";
import {
  type CategoryItem,
  createCategory,
  followDM,
  followThread,
  moveGroupToCategory,
  refollowChannel,
  unfollowChannel,
  unfollowDM,
  unfollowThread,
} from "@/features/base/api/endpoints/follow.api";
import {
  sidebarFollowQueryKey,
  sidebarFollowQueryOptions,
} from "@/features/chat/queries/sidebar.query";
import {
  categoriesQueryKey,
  categoriesQueryOptions,
} from "@/features/chat/queries/categories.query";
import { AiBadge } from "@/features/base/components/badges/ai-badge";
import { ThreadIcon } from "@/components/ui/thread-icon";
import { MuteIcon } from "@/components/ui/mute-icon";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { ConversationOnlineBadge } from "@/features/chat/components/conversation-online-badge";
import { ConversationTypingDigest } from "@/features/chat/components/conversation-typing-digest";
import { conversationsQueryOptions } from "@/features/chat/queries/conversations.query";
import { useConversationsSync } from "@/features/chat/hooks/use-conversations-sync.hook";
import { chatSelectedActions, chatSelectedStore } from "@/features/chat/stores/chat-selected";
import {
  effectiveMute,
  isMentionMe,
  lastMessageDigest,
} from "@/features/chat/lib/conversation-last-content";
import { tryFetchChannelInfo } from "@/features/chat/lib/live-channel-title";

export type ConvTab = "follow" | "recent";

/** ChannelType 5 = ChannelTypeCommunityTopic(子区,SDK 1.3.5 未导出常量,对齐旧 dmworkbase Const.ts)。 */
const CHANNEL_TYPE_THREAD = 5;

interface ConversationListProps {
  selectedChannelId?: string;
  onSelect?: (conversation: Conversation) => void;
  /** "recent": 所有会话(默认);"follow": 仅 group/topic(对应旧 ChatConversationList filter="group") */
  filter?: ConvTab;
}

function unreadBadge(unread: number): string {
  if (unread <= 0) return "";
  return unread > 99 ? "99+" : String(unread);
}

/**
 * 1:1 对齐老仓 `Utils/time.ts::getTimeStringAutoShort2(timestamp, mustIncludeTime=true)`:
 *
 *   <60s     → "刚刚"
 *   当天     → "HH:MM"
 *   昨天     → "昨天 HH:MM"
 *   前天     → "前天 HH:MM"
 *   7 天内   → "星期X HH:MM"
 *   当年其他 → "yyyy/M/d HH:MM"(老仓 fallback 用完整年份)
 *   往年     → "yyyy/M/d HH:MM"
 *
 * 老仓注释强调:用月日**直接比较**判昨天/前天,**不能**用时间戳差值
 * (跨日 1h 边界场景会判错)。
 */
const WEEKDAY_ZH = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
function formatHHMM(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function timeLabel(ts: number): string {
  if (!ts) return "";
  const src = new Date(ts * 1000);
  const now = new Date();
  const sameYear = src.getFullYear() === now.getFullYear();
  const timeExtra = ` ${formatHHMM(src)}`;

  if (!sameYear) {
    return `${src.getFullYear()}/${src.getMonth() + 1}/${src.getDate()}${timeExtra}`;
  }

  const sameMonth = src.getMonth() === now.getMonth();
  const sameDay = sameMonth && src.getDate() === now.getDate();
  if (sameDay) {
    if (now.getTime() - src.getTime() < 60 * 1000) return "刚刚";
    return formatHHMM(src);
  }

  // 昨天 / 前天 — 用月日直接比较(老仓注释:不能用 deltaTime/3600/1000 > 24 的跨日 1h 错判)
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (src.getMonth() === yesterday.getMonth() && src.getDate() === yesterday.getDate()) {
    return `昨天${timeExtra}`;
  }
  const before = new Date();
  before.setDate(before.getDate() - 2);
  if (src.getMonth() === before.getMonth() && src.getDate() === before.getDate()) {
    return `前天${timeExtra}`;
  }

  // 7 天内 → 星期X
  const deltaHour = (now.getTime() - src.getTime()) / (3600 * 1000);
  if (deltaHour <= 7 * 24) {
    return `${WEEKDAY_ZH[src.getDay()]}${timeExtra}`;
  }
  return `${src.getFullYear()}/${src.getMonth() + 1}/${src.getDate()}${timeExtra}`;
}

/**
 * 单行会话(对应旧 dmworkbase ConversationList::conversationItem 非 compact 渲染):
 *
 * 装饰对齐老仓 1:1 — 行 padding 7×8 / rounded-sm / hover / 置顶底色 / 头像 32×32
 *
 * 头像区(.wk-conversationlist-item-avatar-box):
 * - 子区(ChannelTypeCommunityTopic):头像借父群头像 + 右下叠 `#` 角标(wk-conv-group-hash-badge)
 * - person 非子区且 online(channelInfo.online ‖ 1 小时内 lastOffline):右下叠 9×9 绿点
 * - 未读右上:静音 → 9×9 红点(wk-conv-unread-dot);非静音 → 数字胶囊
 *
 * first-line:`[ThreadIcon] {displayName} [AiBadge] [外部] [identityIcon] [muteIcon]    {time}`
 * second-line:`[N条]红字前缀 (静音多未读) + [typing/[草稿]/digest]    {@我}`
 *
 * effectiveMute:子区无显式 mute 时继承父群(由 lib/conversation-last-content effectiveMute 计算)
 * isMentionMe:reminders 优先,fallback lastMessage.content.mention.uids 包含 myUid
 * lastMessageDigest:撤回 → 撤回 tip;group/topic 自动加发送人前缀
 *
 * AI 协作 fold session 预览(老仓 wk-ai-collab-preview)— 数据源 AI 协作模块未搬,本期跳过。
 */
function ConversationRow({
  conversation,
  active,
  myUid,
  onClick,
  onContextMenu,
}: {
  conversation: Conversation;
  active: boolean;
  myUid: string;
  onClick: () => void;
  onContextMenu: (e: MouseEvent) => void;
}) {
  const channel = conversation.channel;
  const info = conversation.channelInfo;
  const isThread = channel.channelType === CHANNEL_TYPE_THREAD;
  const isPerson = channel.channelType === ChannelTypePerson;
  const isGroup = channel.channelType === ChannelTypeGroup;
  const isMuted = effectiveMute(conversation);
  const hasUnread = conversation.unread > 0;
  const unread = unreadBadge(conversation.unread);
  const mentionMe = isMentionMe(conversation, myUid);

  // displayName 优先 orgData.displayName(remark > realName > name),fallback title
  const orgData = info?.orgData as
    | {
        displayName?: string;
        is_external_group?: number;
        robot?: number;
        identityIcon?: string;
        identitySize?: { width: string; height: string };
      }
    | undefined;
  // 真 title(displayName 或 channelInfo.title);**没拉到走 skeleton**,不显 channelID
  // (避免先闪 raw ID 再 pop 到真 title — 用户视觉跳变)
  const realTitle = orgData?.displayName || info?.title || "";
  const titleLoading = !realTitle;
  const title = realTitle || channel.channelID; // channelID 仅作 aria 兜底,不直接显
  const isExternal = isGroup && orgData?.is_external_group === 1;
  const isBot = isPerson && orgData?.robot === 1;
  const identityIcon = orgData?.identityIcon;
  const identitySize = orgData?.identitySize;

  // 子区:头像借父群 + 面包屑(parentGroupInfo.orgData.displayName fallback title)
  const parentGroupNo = isThread ? parseThreadChannelId(channel.channelID)?.groupNo : undefined;
  const parentChannel = parentGroupNo ? new Channel(parentGroupNo, ChannelTypeGroup) : undefined;
  const parentChannelInfo = parentChannel
    ? WKSDK.shared().channelManager.getChannelInfo(parentChannel)
    : undefined;
  if (parentChannel && !parentChannelInfo) {
    tryFetchChannelInfo(parentChannel);
  }
  const avatarChannel = isThread && parentChannel ? parentChannel : channel;
  const avatarTitle = isThread ? (parentChannelInfo?.title ?? title) : title;
  const parentOrg = parentChannelInfo?.orgData as { displayName?: string } | undefined;
  const breadcrumb = isThread ? parentOrg?.displayName || parentChannelInfo?.title : undefined;

  // online 显示判定:online 或 1 小时内离线(对齐 needShowOnlineStatus)
  const showOnline = (() => {
    if (!isPerson || isThread || !info) return false;
    if (info.online) return true;
    const now = Date.now() / 1000;
    const btw = now - (info.lastOffline ?? 0);
    return btw > 0 && btw < 60 * 60;
  })();

  const digest = lastMessageDigest(conversation, myUid);
  // 静音 + 多未读:digest 前置 [N 条] 红字(低打扰,对齐 wk-conv-count-hint)
  const showCountHint = isMuted && conversation.unread > 1;

  return (
    // 行(对齐老仓 .wk-conversationlist-item):py-[7px] px-2 + rounded-md(--wk-r-sm=6) +
    //   mb-[1px] + hover bg item-hover(rgba(46,50,56,0.09))+ selected bg brand-tint-06
    //   (rgba(28,28,35,0.06));置顶**不做特殊背景**(老仓 css 行 76-78 注释)
    <button
      type="button"
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={`mb-[1px] flex w-full items-center gap-[10px] rounded-md px-2 py-[7px] text-left transition-colors duration-150 ease-(--ease-emphasized) ${
        active ? "bg-[rgba(28,28,35,0.06)]" : "hover:bg-[rgba(46,50,56,0.09)]"
      }`}
    >
      {/* avatar-box 32×32(对齐 .wk-conversationlist-item-avatar-box) */}
      <div className="relative h-8 w-8 shrink-0">
        <ChannelAvatar channel={avatarChannel} size={32} title={avatarTitle} />
        {/* 子区头像下挂 # 角标(.wk-conv-group-hash-badge:16x16 圆 + 1.5px ring base + GroupIcon size 10) */}
        {isThread ? (
          <span
            aria-hidden
            className="absolute right-[-3px] bottom-[-3px] flex h-4 w-4 items-center justify-center rounded-full border-[1.5px] border-bg-base bg-bg-elevated text-text-secondary"
          >
            <svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor" aria-hidden>
              <path d="M9 6h6v2H9zM7 11h10v2H7zM9 16h6v2H9z" />
            </svg>
          </span>
        ) : showOnline ? (
          <ConversationOnlineBadge />
        ) : null}
        {/* 未读 — 静音:9×9 红点(.wk-conv-unread-dot) / 非静音:数字 -6 -6 + 2px ring base(.wk-conv-unread-num) */}
        {hasUnread &&
          (isMuted ? (
            <span
              aria-hidden
              className="box-border absolute -top-[2px] -right-[2px] h-[9px] w-[9px] rounded-full border-2 border-bg-base bg-error"
            />
          ) : (
            <span
              aria-label={`${conversation.unread} 条未读`}
              className="absolute -top-[6px] -right-[6px] box-border inline-flex h-4 min-w-4 items-center justify-center rounded-[9px] border-2 border-bg-base bg-error px-1 text-[10px] leading-none font-semibold text-white"
            >
              {unread}
            </span>
          ))}
      </div>

      {/* right(flex-col gap 2px,对齐 .wk-conversationlist-item-right) */}
      <div className="flex min-w-0 flex-1 flex-col gap-[2px] overflow-hidden">
        {/* 子区面包屑 — 父群 displayName(对齐 .wk-conv-breadcrumb:size xs=11 / color icon-default=0.6 / mb-[3px]) */}
        {breadcrumb ? (
          <span className="mb-[3px] truncate text-[11px] leading-none text-[#1c1c23]/60">
            {breadcrumb}
          </span>
        ) : null}

        {/* first-line:flex items-center gap-1.5(6px),time margin-left:auto(老仓
            .wk-conversationlist-item-right-first-line + .wk-conversationlist-item-time) */}
        <div className="flex items-center gap-1.5 overflow-hidden">
          <h3
            className={`m-0 flex min-w-0 flex-1 items-center gap-1.5 truncate text-[13px] leading-[1.4] ${
              isMuted ? "text-[#1c1c23]/40" : "text-[#1c1c23]/90"
            } ${hasUnread && !isMuted ? "font-semibold" : "font-medium"}`}
          >
            {isThread ? <ThreadIcon size={13} className="shrink-0 text-[#1c1c23]/60" /> : null}
            {titleLoading ? (
              <span
                aria-hidden
                aria-label={title}
                className="conv-list-skeleton h-3 w-24 shrink rounded-sm"
              />
            ) : (
              <span className="min-w-0 truncate">{title}</span>
            )}
            {isBot ? <AiBadge size="small" /> : null}
            {isExternal ? (
              <span className="ml-1 shrink-0 rounded-sm bg-brand-tint px-1 text-[10px] font-medium text-text-secondary">
                外部
              </span>
            ) : null}
            {identityIcon ? (
              <img
                src={identityIcon}
                alt=""
                aria-hidden
                className="shrink-0"
                style={{ width: identitySize?.width ?? 18, height: identitySize?.height ?? 18 }}
              />
            ) : null}
            {isMuted ? (
              <MuteIcon size={11} aria-label="免打扰" className="shrink-0 text-[#1c1c23]/40" />
            ) : null}
          </h3>
          <span className="ml-auto shrink-0 text-[11px] leading-none font-normal text-[#1c1c23]/60">
            {timeLabel(conversation.timestamp)}
          </span>
        </div>

        {/* second-line:lastmsg flex-1(size sm=12 / color icon-default=0.6 / weight 400)+ @我 badge ml-1 */}
        <div className="flex items-center overflow-hidden">
          <span
            className={`flex min-w-0 flex-1 items-center gap-1 truncate text-[12px] leading-none font-normal ${
              isMuted ? "text-[#1c1c23]/40" : "text-[#1c1c23]/60"
            }`}
          >
            <ConversationTypingDigest
              channel={channel}
              fallback={digest}
              reminders={conversation.simpleReminders}
              countHint={showCountHint ? conversation.unread : 0}
            />
          </span>
          {/* @我 badge(.wk-mention-badge:bg-danger / white / h-14 / rounded-[3px] / size tiny=10 / weight 600 / ml-1) */}
          {mentionMe && hasUnread && !isMuted ? (
            <span className="ml-1 inline-flex h-[14px] shrink-0 items-center rounded-[3px] bg-error px-1 text-[10px] leading-none font-semibold text-white">
              @我
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}

const RECENT_INACTIVE_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000;
function isVisibleInRecentTab(c: Conversation, now: number): boolean {
  if (c.channel.channelType !== ChannelTypeGroup) return true;
  return now - (c.timestamp || 0) * 1000 < RECENT_INACTIVE_THRESHOLD_MS;
}

const TOP_BOOST = 1_000_000_000_000;

/** 列表加载骨架 shimmer 动画(对齐 follow-list 同款,老仓 wk-skeleton-shimmer 1.2s linear) */
const LIST_SKELETON_STYLE = `
.conv-list-skeleton {
  background: linear-gradient(90deg,
    rgba(28,28,35,0.10) 25%,
    rgba(28,28,35,0.22) 50%,
    rgba(28,28,35,0.10) 75%);
  background-size: 200% 100%;
  animation: conv-list-skeleton-shimmer 1.2s infinite linear;
}
@keyframes conv-list-skeleton-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
`;
function sortConversations(list: Conversation[]): Conversation[] {
  return [...list].sort((a, b) => {
    const aTop = a.extra?.top === 1 ? TOP_BOOST : 0;
    const bTop = b.extra?.top === 1 ? TOP_BOOST : 0;
    return (b.timestamp || 0) + bTop - ((a.timestamp || 0) + aTop);
  });
}

/**
 * 会话列表(对应旧 ConversationList,**含 F-7 右键菜单**)。
 *
 * 右键菜单 1:1 对齐老仓 `ConversationList::menus`(L1055-1218,最近 tab `hideCloseChat=false`):
 *   1. 标为已读(unread > 0 时)
 *   2. 关闭聊天窗口(平铺,Confirm)
 *   3. **关注 / 取消关注**(对齐老仓 ChatConversationList::buildExtraMenus L195-343)
 *      - 已关注(sidebar followedKeys 命中)→ 单项"取消关注"
 *      - 未关注:
 *        · Thread + 父群已关注 → 单项"添加到关注"(直接 followThread)
 *        · Thread + 父群未关注 → "添加到关注 → 子菜单(选分组 → refollow 父群+moveGroup+followThread)"
 *        · Group/DM → "添加到关注 → 子菜单(选分组 → refollow+moveGroup OR followDM(uid, cat))"
 *        · 子菜单尾部含"+ 新建分组"
 *   4. 置顶 / 取消置顶
 *   5. 开启 / 关闭免打扰
 *   6. ── 分隔线 ──
 *   7a. 子区:清空聊天记录(平铺)
 *   7b. 群/DM:**更多 →** 子菜单 → 清空聊天记录 / 关闭窗口并清空记录
 *
 * 注:**follow 状态权威源用 sidebar followedKeys,不能用 channelInfo.orgData.is_followed**
 * (老仓 GH #337 review 指出 IM 同步缓存在取关后不会立即清空,会让取关后的项继续显示"取消关注")
 *
 * **展开/收起子区**:老仓 compact 模式才有,新仓子区永远独立行,跳过。
 */
export function ConversationList({
  selectedChannelId,
  onSelect,
  filter = "recent",
}: ConversationListProps) {
  const qc = useQueryClient();
  const myUid = useStore(authStore, (s) => s.user?.uid ?? "");
  const spaceId = useStore(spaceStore, (s) => s.spaceId);
  useConversationsSync();
  const { data, isLoading, error } = useQuery(conversationsQueryOptions(spaceId));
  // sidebar follow 权威源(已关注集合) + categories(子菜单可选分组列表)
  const sidebarQ = useQuery(sidebarFollowQueryOptions(spaceId));
  const categoriesQ = useQuery(categoriesQueryOptions(spaceId));

  const [menu, setMenu] = useState<{ open: boolean; x: number; y: number; conv?: Conversation }>({
    open: false,
    x: 0,
    y: 0,
  });
  const [confirmClear, setConfirmClear] = useState<Conversation | null>(null);
  const [confirmClose, setConfirmClose] = useState<Conversation | null>(null);
  const [confirmCloseAndClear, setConfirmCloseAndClear] = useState<Conversation | null>(null);
  const [createCategoryOpen, setCreateCategoryOpen] = useState(false);

  const filtered = useMemo(() => {
    const all = data ?? [];
    if (filter === "follow") return [];
    const now = Date.now();
    return sortConversations(all.filter((c) => isVisibleInRecentTab(c, now)));
  }, [data, filter]);

  // ─── Mutations ─────────────────────────────────────────

  const refreshChannelInfo = (conv: Conversation) => {
    void WKSDK.shared().channelManager.fetchChannelInfo(conv.channel);
  };

  const invalidateFollow = () => {
    void qc.invalidateQueries({ queryKey: sidebarFollowQueryKey(spaceId) });
    void qc.invalidateQueries({ queryKey: categoriesQueryKey(spaceId) });
  };

  const topMu = useMutation({
    mutationFn: (args: { conv: Conversation; top: boolean }) =>
      setChannelTop(args.conv.channel, args.top),
    onSuccess: (_void, args) => {
      refreshChannelInfo(args.conv);
      toast.success(args.top ? "已置顶" : "已取消置顶");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "操作失败"),
  });

  const muteMu = useMutation({
    mutationFn: (args: { conv: Conversation; mute: boolean }) =>
      setChannelMute(args.conv.channel, args.mute),
    onSuccess: (_void, args) => {
      refreshChannelInfo(args.conv);
      toast.success(args.mute ? "已开启免打扰" : "已关闭免打扰");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "操作失败"),
  });

  const clearUnreadMu = useMutation({
    mutationFn: (conv: Conversation) =>
      clearConversationUnread({
        channelId: conv.channel.channelID,
        channelType: conv.channel.channelType,
      }),
    onSuccess: (_void, conv) => {
      // 本地立即把 unread 置 0,SDK 推送会再次确认
      conv.unread = 0;
      void qc.invalidateQueries({ queryKey: ["chat", "conversations"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "标记已读失败"),
  });

  const clearMessagesMu = useMutation({
    mutationFn: (conv: Conversation) =>
      clearChannelMessages({
        channelId: conv.channel.channelID,
        channelType: conv.channel.channelType,
        messageSeq: conv.lastMessage?.messageSeq ?? 0,
      }),
    onSuccess: (_void, conv) => {
      // 清空本地 messages query cache
      qc.setQueryData(["chat", "messages", conv.channel.channelType, conv.channel.channelID], {
        pages: [[]],
        pageParams: [0],
      });
      toast.success("已清空聊天记录");
      setConfirmClear(null);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "清空失败"),
  });

  const closeChatMu = useMutation({
    mutationFn: (conv: Conversation) =>
      deleteConversation({
        channelId: conv.channel.channelID,
        channelType: conv.channel.channelType,
      }),
    onSuccess: (_void, conv) => {
      // 本地从 SDK conversations 数组移除并刷 snapshot
      WKSDK.shared().conversationManager.removeConversation(conv.channel);
      const snapshot = [...WKSDK.shared().conversationManager.conversations];
      qc.setQueryData(["chat", "conversations", spaceId ?? "_"], snapshot);
      // 如果当前 selected 是这个会话,清空 selected
      if (chatSelectedStore.state.channel?.channelID === conv.channel.channelID) {
        chatSelectedActions.clear();
      }
      toast.success("已关闭聊天");
      setConfirmClose(null);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "关闭失败"),
  });

  // 取消关注(按 channelType 分流)— Group/DM/Thread
  const unfollowMu = useMutation({
    mutationFn: (conv: Conversation) => {
      const t = conv.channel.channelType;
      if (t === ChannelTypeGroup) return unfollowChannel(conv.channel.channelID);
      if (t === ChannelTypePerson) return unfollowDM(conv.channel.channelID);
      if (t === CHANNEL_TYPE_THREAD) return unfollowThread(conv.channel.channelID);
      return Promise.reject(new Error("不支持的会话类型"));
    },
    onSuccess: () => {
      invalidateFollow();
      toast.success("已取消关注");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "取消关注失败"),
  });

  // 添加到关注 - Group:refollowChannel + moveGroupToCategory
  const followGroupMu = useMutation({
    mutationFn: async (args: { groupNo: string; categoryId: string }) => {
      await refollowChannel(args.groupNo);
      await moveGroupToCategory(args.groupNo, args.categoryId);
    },
    onSuccess: () => {
      invalidateFollow();
      toast.success("已添加到关注");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "添加到关注失败"),
  });

  // 添加到关注 - DM:followDM(uid, categoryId)
  const followDmMu = useMutation({
    mutationFn: (args: { peerUid: string; categoryId: string }) =>
      followDM(args.peerUid, args.categoryId),
    onSuccess: () => {
      invalidateFollow();
      toast.success("已添加到关注");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "添加到关注失败"),
  });

  // 添加到关注 - Thread 父群已关注:直接 followThread
  const followThreadMu = useMutation({
    mutationFn: (threadChannelId: string) => followThread(threadChannelId),
    onSuccess: () => {
      invalidateFollow();
      toast.success("已添加到关注");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "关注子区失败"),
  });

  // 添加到关注 - Thread 父群未关注:refollow 父群 + moveGroup + followThread(三步串行)
  const followThreadWithParentMu = useMutation({
    mutationFn: async (args: {
      threadChannelId: string;
      parentGroupNo: string;
      categoryId: string;
    }) => {
      await refollowChannel(args.parentGroupNo);
      await moveGroupToCategory(args.parentGroupNo, args.categoryId);
      await followThread(args.threadChannelId);
    },
    onSuccess: () => {
      invalidateFollow();
      toast.success("已添加到关注");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "关注子区失败"),
  });

  // 新建分组 — 子菜单尾"+ 新建分组"打开 InputModal
  const createCategoryMu = useMutation({
    mutationFn: (name: string) => {
      if (!spaceId) return Promise.reject(new Error("无 spaceId"));
      return createCategory(spaceId, name.trim());
    },
    onSuccess: () => {
      invalidateFollow();
      setCreateCategoryOpen(false);
      toast.success("分组已创建");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "创建分组失败"),
  });

  // ─── Right-click menu ──────────────────────────────────

  const onRowContextMenu = (conv: Conversation) => (e: MouseEvent) => {
    e.preventDefault();
    setMenu({ open: true, x: e.clientX, y: e.clientY, conv });
  };

  /**
   * 已关注判定:用 sidebar followedKeys 作权威源。
   *
   * **不能**用 channelInfo.orgData.is_followed(IM 同步缓存在删分组级联取关 / 取消关注
   * 后不会立即清空,会让取关后的项继续显示"取消关注" — 老仓 GH #337 review 指出的 bug)。
   */
  const isConvFollowed = (conv: Conversation): boolean => {
    const keys = sidebarQ.data?.followedKeys;
    if (!keys) return false;
    return keys.has(`${conv.channel.channelType}::${conv.channel.channelID}`);
  };

  /** 构建"添加到关注"子菜单(选分组 + 新建分组)— 老仓 ChatConversationList L286-315。 */
  const buildAddFollowSubmenu = (conv: Conversation): ContextMenuItem[] => {
    const validCats = (categoriesQ.data ?? []).filter(
      (c): c is CategoryItem & { category_id: string } =>
        !c.is_default && !!c.category_id && c.category_id !== null,
    );
    const isThread = conv.channel.channelType === CHANNEL_TYPE_THREAD;
    const parentGroupNo = isThread
      ? parseThreadChannelId(conv.channel.channelID)?.groupNo
      : undefined;

    const items: ContextMenuItem[] = validCats.map((cat) => ({
      label: cat.name,
      onClick: () => {
        const t = conv.channel.channelType;
        if (t === ChannelTypeGroup) {
          followGroupMu.mutate({ groupNo: conv.channel.channelID, categoryId: cat.category_id });
        } else if (t === ChannelTypePerson) {
          followDmMu.mutate({ peerUid: conv.channel.channelID, categoryId: cat.category_id });
        } else if (t === CHANNEL_TYPE_THREAD && parentGroupNo) {
          followThreadWithParentMu.mutate({
            threadChannelId: conv.channel.channelID,
            parentGroupNo,
            categoryId: cat.category_id,
          });
        }
      },
    }));
    items.push({ separator: true });
    items.push({
      label: "+ 新建分组",
      onClick: () => setCreateCategoryOpen(true),
    });
    return items;
  };

  /** 1:1 老仓 ConversationList::menus(最近 tab,`hideCloseChat=false / hidePin=false`)。 */
  const buildMenuItems = (conv: Conversation): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [];
    const isMuted = !!conv.channelInfo?.mute;
    const isTop = !!conv.channelInfo?.top || conv.extra?.top === 1;
    const isThread = conv.channel.channelType === CHANNEL_TYPE_THREAD;

    // 1. 标为已读(有未读)
    if (conv.unread > 0) {
      items.push({
        label: "标为已读",
        icon: <Eye size={13} />,
        onClick: () => clearUnreadMu.mutate(conv),
      });
    }
    // 2. 关闭聊天窗口(平铺,对齐老仓 L1083-1098,在前)
    items.push({
      label: "关闭聊天窗口",
      icon: <X size={13} />,
      onClick: () => setConfirmClose(conv),
    });
    // 3. 关注 / 取消关注(对齐老仓 ChatConversationList::buildExtraMenus L195-343 的位置:
    //    挂在第 2 项"关闭聊天窗口"之后、第 4 项"置顶"之前,即老仓 menus L1102 extraMenus 位置)
    if (isConvFollowed(conv)) {
      items.push({
        label: "取消关注",
        icon: <Star size={13} />,
        onClick: () => unfollowMu.mutate(conv),
      });
    } else if (
      isThread &&
      (() => {
        const parentGroupNo = parseThreadChannelId(conv.channel.channelID)?.groupNo;
        if (!parentGroupNo) return false;
        return sidebarQ.data?.followedGroupNos.has(parentGroupNo) ?? false;
      })()
    ) {
      // 子区且父群已关注 → 单项"添加到关注"(直接 followThread,跟随父群分组)
      items.push({
        label: "添加到关注",
        icon: <Star size={13} />,
        onClick: () => followThreadMu.mutate(conv.channel.channelID),
      });
    } else {
      // 群 / DM / 子区(父群未关注)→ "添加到关注" 子菜单(选分组 + 新建分组)
      items.push({
        label: "添加到关注",
        icon: <Star size={13} />,
        children: buildAddFollowSubmenu(conv),
      });
    }
    // 4. 置顶 / 取消置顶(老仓:子区不显;新仓子区独立 row 也走置顶不影响)
    if (!isThread) {
      items.push({
        label: isTop ? "取消置顶" : "置顶聊天",
        icon: isTop ? <PinOff size={13} /> : <Pin size={13} />,
        onClick: () => topMu.mutate({ conv, top: !isTop }),
      });
    }
    // 5. 开启 / 关闭免打扰
    items.push({
      label: isMuted ? "关闭免打扰" : "开启免打扰",
      icon: isMuted ? <BellRing size={13} /> : <BellOff size={13} />,
      onClick: () => muteMu.mutate({ conv, mute: !isMuted }),
    });
    // 6. ── 分隔线 ──
    items.push({ separator: true });
    // 7. 子区:平铺"清空聊天记录";群/DM:**"更多 →"** 子菜单
    if (isThread) {
      items.push({
        label: "清空聊天记录",
        icon: <Trash2 size={13} />,
        danger: true,
        onClick: () => setConfirmClear(conv),
      });
    } else {
      items.push({
        label: "更多",
        icon: <MoreHorizontal size={13} />,
        children: [
          {
            label: "清空聊天记录",
            icon: <Trash2 size={13} />,
            danger: true,
            onClick: () => setConfirmClear(conv),
          },
          {
            label: "关闭窗口并清空记录",
            icon: <Trash2 size={13} />,
            danger: true,
            onClick: () => setConfirmCloseAndClear(conv),
          },
        ],
      });
    }
    return items;
  };

  if (isLoading) {
    // 骨架占位行(对齐 follow-list 同款 shimmer);避免文字"加载会话…"突兀
    return (
      <div className="flex flex-1 flex-col gap-1 px-2 py-1">
        <style>{LIST_SKELETON_STYLE}</style>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2.5 px-2 py-[7px]">
            <span className="conv-list-skeleton h-8 w-8 shrink-0 rounded-md" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="conv-list-skeleton h-3 w-2/5 rounded-sm" />
              <span className="conv-list-skeleton h-3 w-3/4 rounded-sm" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-error">会话加载失败</div>
    );
  }
  if (filtered.length === 0) {
    const emptyText = filter === "follow" ? "暂未接入分组" : "暂无会话";
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
        {emptyText}
      </div>
    );
  }

  return (
    // 对齐老仓 .wk-conversationlist:padding=0,item 自身管 padding(行 1-10 of CSS)
    // 新仓保留 px-2 / py-1 让 selected/hover bg 内缩,不贴 sidebar 边缘
    <div className="flex flex-1 flex-col gap-[1px] overflow-y-auto px-2 py-1">
      {/* skeleton shimmer 始终 inject,row 内 title 没拉到时即用 conv-list-skeleton class */}
      <style>{LIST_SKELETON_STYLE}</style>
      {filtered.map((c) => (
        <ConversationRow
          key={`${c.channel.channelType}-${c.channel.channelID}`}
          conversation={c}
          active={c.channel.channelID === selectedChannelId}
          myUid={myUid}
          onClick={() => onSelect?.(c)}
          onContextMenu={onRowContextMenu(c)}
        />
      ))}

      <ContextMenu
        open={menu.open}
        x={menu.x}
        y={menu.y}
        items={menu.conv ? buildMenuItems(menu.conv) : []}
        onClose={() => setMenu((m) => ({ ...m, open: false }))}
      />

      <ConfirmModal
        open={!!confirmClear}
        title="确认清空"
        content="确定要清空所有聊天记录吗?该操作不可撤销。"
        okDanger
        okText="清空"
        okLoading={clearMessagesMu.isPending}
        onOk={() => confirmClear && clearMessagesMu.mutate(confirmClear)}
        onCancel={() => setConfirmClear(null)}
      />

      <ConfirmModal
        open={!!confirmClose}
        title="确认关闭"
        content="确定要关闭此聊天窗口吗?"
        okText="关闭"
        okLoading={closeChatMu.isPending}
        onOk={() => confirmClose && closeChatMu.mutate(confirmClose)}
        onCancel={() => setConfirmClose(null)}
      />

      <ConfirmModal
        open={!!confirmCloseAndClear}
        title="确认关闭并清空"
        content="确定要关闭窗口并清空所有聊天记录吗?此操作不可撤销。"
        okText="关闭并清空"
        okDanger
        okLoading={closeChatMu.isPending || clearMessagesMu.isPending}
        onOk={() => {
          if (!confirmCloseAndClear) return;
          // 双 mutation 顺序:先 clear messages,再 close(老仓 onCloseChat → onClearMessages 顺序)
          clearMessagesMu.mutate(confirmCloseAndClear);
          closeChatMu.mutate(confirmCloseAndClear);
          setConfirmCloseAndClear(null);
        }}
        onCancel={() => setConfirmCloseAndClear(null)}
      />

      {/* 新建分组 — 关注子菜单尾"+ 新建分组"触发(对齐老仓 ChatConversationList::CreateCategoryModal) */}
      {createCategoryOpen ? (
        <InputModal
          open
          title="新建分组"
          placeholder="输入分组名"
          validate={(v) => v.trim().length > 0}
          okLoading={createCategoryMu.isPending}
          onOk={(v) => createCategoryMu.mutate(v)}
          onCancel={() => setCreateCategoryOpen(false)}
        />
      ) : null}
    </div>
  );
}
