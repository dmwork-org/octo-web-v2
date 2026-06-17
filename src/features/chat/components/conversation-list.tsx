import { useEffect, useMemo, useRef, useState, type MouseEvent, type RefObject } from "react";
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
import {
  conversationsQueryOptions,
  conversationsQueryKey,
} from "@/features/chat/queries/conversations.query";
import { chatRecentJumpStore } from "@/features/chat/stores/chat-recent-jump";
import { useConversationsSync } from "@/features/chat/hooks/use-conversations-sync.hook";
import { chatSelectedActions, chatSelectedStore } from "@/features/chat/stores/chat-selected";
import {
  effectiveMute,
  isMentionMe,
  lastMessageDigest,
} from "@/features/chat/lib/conversation-last-content";
import { isConversationTop } from "@/features/chat/lib/conversation-top";
import { tryFetchChannelInfo } from "@/features/chat/lib/live-channel-title";
import { useT } from "@/lib/i18n/use-t";
import { t } from "@/lib/i18n/instance";

export type ConvTab = "follow" | "recent";

const CHANNEL_TYPE_THREAD = 5;

interface ConversationListProps {
  selectedChannelId?: string;
  onSelect?: (conversation: Conversation) => void;
  filter?: ConvTab;
}

function unreadBadge(unread: number): string {
  if (unread <= 0) return "";
  return unread > 99 ? "99+" : String(unread);
}

function conversationDomKey(conversation: Conversation): string {
  return `${conversation.channel.channelType}-${conversation.channel.channelID}`;
}

function parentGroupNoOfThread(conversation: Conversation): string | undefined {
  if (conversation.channel.channelType !== CHANNEL_TYPE_THREAD) return undefined;
  const orgData = conversation.channelInfo?.orgData as { parentGroupNo?: string } | undefined;
  return orgData?.parentGroupNo || parseThreadChannelId(conversation.channel.channelID)?.groupNo;
}

function buildThreadsByParent(conversations: Conversation[]): Map<string, Conversation[]> {
  const threadsByParent = new Map<string, Conversation[]>();
  for (const conversation of conversations) {
    const parentGroupNo = parentGroupNoOfThread(conversation);
    if (!parentGroupNo) continue;
    const threads = threadsByParent.get(parentGroupNo) ?? [];
    threads.push(conversation);
    threadsByParent.set(parentGroupNo, threads);
  }
  return threadsByParent;
}

const WEEKDAY_KEYS = [
  "convList.weekday.sun",
  "convList.weekday.mon",
  "convList.weekday.tue",
  "convList.weekday.wed",
  "convList.weekday.thu",
  "convList.weekday.fri",
  "convList.weekday.sat",
];

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
    if (now.getTime() - src.getTime() < 60 * 1000) return t("convList.justNow");
    return formatHHMM(src);
  }

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (src.getMonth() === yesterday.getMonth() && src.getDate() === yesterday.getDate()) {
    return t("convList.yesterday", { values: { time: formatHHMM(src) } });
  }
  const before = new Date();
  before.setDate(before.getDate() - 2);
  if (src.getMonth() === before.getMonth() && src.getDate() === before.getDate()) {
    return t("convList.dayBeforeYesterday", { values: { time: formatHHMM(src) } });
  }

  const deltaHour = (now.getTime() - src.getTime()) / (3600 * 1000);
  if (deltaHour <= 7 * 24) {
    return `${t(WEEKDAY_KEYS[src.getDay()])}${timeExtra}`;
  }
  return `${src.getFullYear()}/${src.getMonth() + 1}/${src.getDate()}${timeExtra}`;
}

function ConversationRow({
  conversation,
  active,
  myUid,
  hasThreads,
  onClick,
  onContextMenu,
  rowRef,
  unreadPulseToken,
  suppressDraft,
}: {
  conversation: Conversation;
  /**
   * 行高亮:命中"当前选中会话"或"被右键(临时)"任一即点亮(对齐老仓
   * selectConversationWrap)。caller 传 active = (selectedChannelId match) ||
   * (ctxMenuRowKey match)。
   */
  active: boolean;
  myUid: string;
  hasThreads?: boolean;
  onClick: () => void;
  onContextMenu: (e: MouseEvent) => void;
  rowRef?: (node: HTMLButtonElement | null) => void;
  unreadPulseToken?: number;
  suppressDraft?: boolean;
}) {
  const tt = useT();
  const channel = conversation.channel;
  const info = conversation.channelInfo;
  const isThread = channel.channelType === CHANNEL_TYPE_THREAD;
  const isPerson = channel.channelType === ChannelTypePerson;
  const isGroup = channel.channelType === ChannelTypeGroup;
  const isMuted = effectiveMute(conversation);
  const hasUnread = conversation.unread > 0;
  const unread = unreadBadge(conversation.unread);
  const shouldShakeUnread = !!unreadPulseToken;
  const mentionMe = isMentionMe(conversation, myUid);

  const orgData = info?.orgData as
    | {
        displayName?: string;
        is_external_group?: number;
        robot?: number;
        identityIcon?: string;
        identitySize?: { width: string; height: string };
      }
    | undefined;
  const realTitle = orgData?.displayName || info?.title || "";
  const titleLoading = !realTitle;
  const title = realTitle || channel.channelID;
  const isExternal = isGroup && orgData?.is_external_group === 1;
  const isBot = isPerson && orgData?.robot === 1;
  const identityIcon = orgData?.identityIcon;
  const identitySize = orgData?.identitySize;

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

  const showOnline = (() => {
    if (!isPerson || isThread || !info) return false;
    if (info.online) return true;
    const now = Date.now() / 1000;
    const btw = now - (info.lastOffline ?? 0);
    return btw > 0 && btw < 60 * 60;
  })();

  const digest = lastMessageDigest(conversation, myUid);
  const showCountHint = isMuted && conversation.unread > 1;

  return (
    <button
      ref={rowRef}
      type="button"
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={`mb-[1px] flex w-full items-center gap-[10px] rounded-md px-2 py-[7px] text-left transition-colors duration-150 ease-(--ease-emphasized) ${
        active ? "bg-[rgba(28,28,35,0.06)]" : "hover:bg-[rgba(46,50,56,0.09)]"
      }`}
    >
      <div className="relative h-8 w-8 shrink-0">
        <ChannelAvatar channel={avatarChannel} size={32} title={avatarTitle} />
        {isGroup && hasThreads ? (
          <span
            aria-hidden
            className="absolute right-[-3px] bottom-[-3px] flex h-4 w-4 items-center justify-center rounded-full border-[1.5px] border-bg-base bg-bg-elevated text-text-secondary"
          >
            <GroupCornerIcon size={10} />
          </span>
        ) : showOnline ? (
          <ConversationOnlineBadge />
        ) : null}
        {hasUnread &&
          (isMuted ? (
            <span
              key={shouldShakeUnread ? `muted-unread-${unreadPulseToken}` : "muted-unread"}
              aria-hidden
              className={`absolute -top-[2px] -right-[2px] box-border h-[9px] w-[9px] rounded-full border-2 border-bg-base bg-error ${
                shouldShakeUnread ? "wk-unread-badge-shake" : ""
              }`}
            />
          ) : (
            <span
              key={shouldShakeUnread ? `unread-${unreadPulseToken}` : "unread"}
              aria-label={tt("convList.unreadAria", { values: { count: conversation.unread } })}
              className={`absolute -top-[6px] -right-[6px] box-border inline-flex h-4 min-w-4 items-center justify-center rounded-[9px] border-2 border-bg-base bg-error px-1 text-[10px] leading-none font-semibold text-white ${
                shouldShakeUnread ? "wk-unread-badge-shake" : ""
              }`}
            >
              {unread}
            </span>
          ))}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-[2px] overflow-hidden">
        {breadcrumb ? (
          <span className="mb-[3px] truncate text-[11px] leading-none text-[#1c1c23]/60">
            {breadcrumb}
          </span>
        ) : null}

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
                {tt("convList.external")}
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
              <MuteIcon
                size={11}
                aria-label={tt("convList.muteAria")}
                className="shrink-0 text-[#1c1c23]/40"
              />
            ) : null}
          </h3>
          <span className="ml-auto shrink-0 text-[11px] leading-none font-normal text-[#1c1c23]/60">
            {timeLabel(conversation.timestamp)}
          </span>
        </div>

        <div className="flex items-center overflow-hidden">
          <span
            className={`flex min-w-0 flex-1 items-center gap-1 truncate text-[12px] leading-[18px] font-normal ${
              isMuted ? "text-[#1c1c23]/40" : "text-[#1c1c23]/60"
            }`}
          >
            <ConversationTypingDigest
              channel={channel}
              fallback={digest}
              reminders={conversation.simpleReminders}
              countHint={showCountHint ? conversation.unread : 0}
              suppressDraft={suppressDraft}
            />
          </span>
          {mentionMe && hasUnread && !isMuted ? (
            <span className="ml-1 inline-flex h-[14px] shrink-0 items-center rounded-[3px] bg-error px-1 text-[10px] leading-none font-semibold text-white">
              {tt("convList.mentionMe")}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}

function GroupCornerIcon({ size = 10 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M8.07978 14.5547H5.44633C2.97245 14.5547 1.01367 14.5547 1.01367 13.3032V13.0428C1.01367 10.6411 3.00148 8.68789 5.44633 8.68789H8.07981C10.5247 8.68789 12.5125 10.6411 12.5125 13.0428V13.3032C12.5125 14.5547 10.4594 14.5547 8.07978 14.5547ZM6.63611 8.35512C4.69908 8.35512 3.1248 6.80704 3.1248 4.9045C3.1248 3.00194 4.69908 1.45386 6.63609 1.45386C8.57312 1.45386 10.1474 3.00194 10.1474 4.90448C10.1474 6.80704 8.57312 8.35512 6.63611 8.35512Z"
        fill="currentColor"
        fillOpacity="0.3"
      />
      <path
        d="M13.2742 13.7098C13.4919 12.2405 13.0104 10.8867 11.8296 9.64856C13.5792 9.64856 15.0016 11.0127 15.0016 12.69V12.8719C15.0016 13.746 14.2054 13.6835 13.2742 13.7098ZM11.4751 9.28453C9.98711 8.30172 10.8874 8.71275 9.05469 8.13895C10.3354 7.40811 10.7751 6.8333 10.8874 4.73169C12.2492 4.73169 13.3559 5.83463 13.3559 7.19013C13.3559 8.54563 12.8369 9.28453 11.4751 9.28453Z"
        fill="currentColor"
        fillOpacity="0.3"
      />
    </svg>
  );
}

const TOP_BOOST = 1_000_000_000_000;

const LIST_SKELETON_STYLE = `
.wk-unread-badge-shake {
  animation: wk-unread-badge-shake 420ms ease-in-out both;
  transform-origin: center;
}
@keyframes wk-unread-badge-shake {
  0% { transform: translateX(0); }
  18% { transform: translateX(-3px); }
  36% { transform: translateX(3px); }
  54% { transform: translateX(-2px); }
  72% { transform: translateX(2px); }
  100% { transform: translateX(0); }
}
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

function latestUnreadConversation(list: Conversation[]): Conversation | undefined {
  return list.reduce<Conversation | undefined>((best, current) => {
    if (current.unread <= 0 || effectiveMute(current)) return best;
    if (!best) return current;

    const currentTimestamp = current.timestamp || 0;
    const bestTimestamp = best.timestamp || 0;
    if (currentTimestamp !== bestTimestamp) {
      return currentTimestamp > bestTimestamp ? current : best;
    }

    const currentSeq = current.lastMessage?.messageSeq ?? 0;
    const bestSeq = best.lastMessage?.messageSeq ?? 0;
    return currentSeq > bestSeq ? current : best;
  }, undefined);
}

function scrollRowToListTop(container: HTMLDivElement, row: HTMLButtonElement) {
  const top =
    container.scrollTop + row.getBoundingClientRect().top - container.getBoundingClientRect().top;
  container.scrollTo({ top, behavior: "smooth" });
}

/**
 * 监听 recent tab 点击 token,变化时找最新 unread+visible+unmuted 会话,
 * 只把对应 row 滚到最近列表顶部并触发未读角标动效,不切换当前会话。
 */
function useRecentUnreadJump(
  filter: ConvTab,
  list: Conversation[],
  listRef: RefObject<HTMLDivElement | null>,
  rowRefs: RefObject<Map<string, HTMLButtonElement>>,
  onPulseUnread: (key: string) => void,
) {
  const token = useStore(chatRecentJumpStore, (s) => s.token);
  const lastTokenRef = useRef(token);
  useEffect(() => {
    if (token === lastTokenRef.current) return;
    lastTokenRef.current = token;
    if (filter === "follow") return;
    const target = latestUnreadConversation(list);
    if (!target) return;
    const targetKey = conversationDomKey(target);
    onPulseUnread(targetKey);

    window.requestAnimationFrame(() => {
      const container = listRef.current;
      const row = rowRefs.current.get(targetKey);
      if (!container || !row) return;
      scrollRowToListTop(container, row);
    });
  }, [token, filter, list, listRef, rowRefs, onPulseUnread]);
}

function sortConversations(list: Conversation[]): Conversation[] {
  return [...list].sort((a, b) => {
    const aTop = isConversationTop(a) ? TOP_BOOST : 0;
    const bTop = isConversationTop(b) ? TOP_BOOST : 0;
    return (b.timestamp || 0) + bTop - ((a.timestamp || 0) + aTop);
  });
}

export function ConversationList({
  selectedChannelId,
  onSelect,
  filter = "recent",
}: ConversationListProps) {
  const tt = useT();
  const qc = useQueryClient();
  const myUid = useStore(authStore, (s) => s.user?.uid ?? "");
  const spaceId = useStore(spaceStore, (s) => s.spaceId);
  useConversationsSync();
  const { data, isLoading, error } = useQuery(conversationsQueryOptions(spaceId));
  const sidebarQ = useQuery(sidebarFollowQueryOptions(spaceId));
  const categoriesQ = useQuery(categoriesQueryOptions(spaceId));

  const [menu, setMenu] = useState<{ open: boolean; x: number; y: number; conv?: Conversation }>({
    open: false,
    x: 0,
    y: 0,
  });
  /** 被右键的 row(临时高亮,菜单关闭时清空);对齐老仓 selectConversationWrap。 */
  const [ctxMenuRowKey, setCtxMenuRowKey] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState<Conversation | null>(null);
  const [confirmClose, setConfirmClose] = useState<Conversation | null>(null);
  const [confirmCloseAndClear, setConfirmCloseAndClear] = useState<Conversation | null>(null);
  const [createCategoryOpen, setCreateCategoryOpen] = useState(false);
  const [recentJumpPulse, setRecentJumpPulse] = useState<{ key: string; token: number } | null>(
    null,
  );
  const listRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());

  const filtered = useMemo(() => {
    const all = data ?? [];
    if (filter === "follow") return [];
    // 信任后端最近会话列表(对齐上游 f85ba4d0):删除前端 3 天群聊不活跃过滤,
    // 避免 backend 返了 N 条未读但前端 hide 出现"角标 N 列表看不到"幽灵。
    return sortConversations(all);
  }, [data, filter]);
  const threadsByParent = useMemo(() => buildThreadsByParent(filtered), [filtered]);

  useRecentUnreadJump(filter, filtered, listRef, rowRefs, (key) => {
    setRecentJumpPulse((prev) => ({ key, token: (prev?.token ?? 0) + 1 }));
  });

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
      void qc.invalidateQueries({ queryKey: conversationsQueryKey(spaceId) });
      toast.success(args.top ? t("convList.toast.pinned") : t("convList.toast.unpinned"));
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("convList.toast.opFailed")),
  });

  const muteMu = useMutation({
    mutationFn: (args: { conv: Conversation; mute: boolean }) =>
      setChannelMute(args.conv.channel, args.mute),
    onSuccess: (_void, args) => {
      refreshChannelInfo(args.conv);
      toast.success(args.mute ? t("convList.toast.muted") : t("convList.toast.unmuted"));
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("convList.toast.opFailed")),
  });

  const clearUnreadMu = useMutation({
    mutationFn: (conv: Conversation) =>
      clearConversationUnread({
        channelId: conv.channel.channelID,
        channelType: conv.channel.channelType,
      }),
    onSuccess: (_void, conv) => {
      conv.unread = 0;
      void qc.invalidateQueries({ queryKey: ["chat", "conversations"] });
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("convList.toast.markReadFailed")),
  });

  const clearMessagesMu = useMutation({
    mutationFn: (conv: Conversation) =>
      clearChannelMessages({
        channelId: conv.channel.channelID,
        channelType: conv.channel.channelType,
        messageSeq: conv.lastMessage?.messageSeq ?? 0,
      }),
    onSuccess: (_void, conv) => {
      qc.setQueryData(["chat", "messages", conv.channel.channelType, conv.channel.channelID], {
        pages: [[]],
        pageParams: [0],
      });
      toast.success(t("convList.toast.cleared"));
      setConfirmClear(null);
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("convList.toast.clearFailed")),
  });

  const closeChatMu = useMutation({
    mutationFn: (conv: Conversation) =>
      deleteConversation({
        channelId: conv.channel.channelID,
        channelType: conv.channel.channelType,
      }),
    onSuccess: (_void, conv) => {
      WKSDK.shared().conversationManager.removeConversation(conv.channel);
      const snapshot = [...WKSDK.shared().conversationManager.conversations];
      qc.setQueryData(["chat", "conversations", spaceId ?? "_"], snapshot);
      if (
        chatSelectedStore.state.channel?.channelID === conv.channel.channelID &&
        chatSelectedStore.state.channel.channelType === conv.channel.channelType
      ) {
        chatSelectedActions.clear();
      }
      toast.success(t("convList.toast.closed"));
      setConfirmClose(null);
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("convList.toast.closeFailed")),
  });

  const unfollowMu = useMutation({
    mutationFn: (conv: Conversation) => {
      const tp = conv.channel.channelType;
      if (tp === ChannelTypeGroup) return unfollowChannel(conv.channel.channelID);
      if (tp === ChannelTypePerson) return unfollowDM(conv.channel.channelID);
      if (tp === CHANNEL_TYPE_THREAD) return unfollowThread(conv.channel.channelID);
      return Promise.reject(new Error(t("convList.error.unsupportedType")));
    },
    onSuccess: () => {
      invalidateFollow();
      toast.success(t("convList.toast.unfollowed"));
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("convList.toast.unfollowFailed")),
  });

  const followGroupMu = useMutation({
    mutationFn: async (args: { groupNo: string; categoryId: string }) => {
      await refollowChannel(args.groupNo);
      await moveGroupToCategory(args.groupNo, args.categoryId);
    },
    onSuccess: () => {
      invalidateFollow();
      toast.success(t("convList.toast.followed"));
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("convList.toast.followFailed")),
  });

  const followDmMu = useMutation({
    mutationFn: (args: { peerUid: string; categoryId: string }) =>
      followDM(args.peerUid, args.categoryId),
    onSuccess: () => {
      invalidateFollow();
      toast.success(t("convList.toast.followed"));
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("convList.toast.followFailed")),
  });

  const followThreadMu = useMutation({
    mutationFn: (threadChannelId: string) => followThread(threadChannelId),
    onSuccess: () => {
      invalidateFollow();
      toast.success(t("convList.toast.followed"));
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("convList.toast.followThreadFailed")),
  });

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
      toast.success(t("convList.toast.followed"));
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("convList.toast.followThreadFailed")),
  });

  const createCategoryMu = useMutation({
    mutationFn: (name: string) => {
      if (!spaceId) return Promise.reject(new Error(t("convList.error.noSpaceId")));
      return createCategory(spaceId, name.trim());
    },
    onSuccess: () => {
      invalidateFollow();
      setCreateCategoryOpen(false);
      toast.success(t("convList.toast.categoryCreated"));
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("convList.toast.createCategoryFailed")),
  });

  const onRowContextMenu = (conv: Conversation) => (e: MouseEvent) => {
    e.preventDefault();
    setCtxMenuRowKey(conv.channel.channelID);
    setMenu({ open: true, x: e.clientX, y: e.clientY, conv });
  };

  const closeContextMenu = () => {
    setMenu((m) => ({ ...m, open: false }));
    setCtxMenuRowKey(null);
  };

  const isConvFollowed = (conv: Conversation): boolean => {
    const keys = sidebarQ.data?.followedKeys;
    if (!keys) return false;
    return keys.has(`${conv.channel.channelType}::${conv.channel.channelID}`);
  };

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
        const tp = conv.channel.channelType;
        if (tp === ChannelTypeGroup) {
          followGroupMu.mutate({ groupNo: conv.channel.channelID, categoryId: cat.category_id });
        } else if (tp === ChannelTypePerson) {
          followDmMu.mutate({ peerUid: conv.channel.channelID, categoryId: cat.category_id });
        } else if (tp === CHANNEL_TYPE_THREAD && parentGroupNo) {
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
      label: t("convList.menu.newCategory"),
      onClick: () => setCreateCategoryOpen(true),
    });
    return items;
  };

  const buildMenuItems = (conv: Conversation): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [];
    const isMuted = !!conv.channelInfo?.mute;
    const isTop = isConversationTop(conv);
    const isThread = conv.channel.channelType === CHANNEL_TYPE_THREAD;

    if (conv.unread > 0) {
      items.push({
        label: t("convList.menu.markRead"),
        icon: <Eye size={13} />,
        onClick: () => clearUnreadMu.mutate(conv),
      });
    }
    items.push({
      label: t("convList.menu.closeChat"),
      icon: <X size={13} />,
      onClick: () => setConfirmClose(conv),
    });
    if (isConvFollowed(conv)) {
      items.push({
        label: t("convList.menu.unfollow"),
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
      items.push({
        label: t("convList.menu.addFollow"),
        icon: <Star size={13} />,
        onClick: () => followThreadMu.mutate(conv.channel.channelID),
      });
    } else {
      items.push({
        label: t("convList.menu.addFollow"),
        icon: <Star size={13} />,
        children: buildAddFollowSubmenu(conv),
      });
    }
    if (!isThread) {
      items.push({
        label: isTop ? t("convList.menu.unpin") : t("convList.menu.pin"),
        icon: isTop ? <PinOff size={13} /> : <Pin size={13} />,
        onClick: () => topMu.mutate({ conv, top: !isTop }),
      });
    }
    items.push({
      label: isMuted ? t("convList.menu.unmute") : t("convList.menu.mute"),
      icon: isMuted ? <BellRing size={13} /> : <BellOff size={13} />,
      onClick: () => muteMu.mutate({ conv, mute: !isMuted }),
    });
    items.push({ separator: true });
    if (isThread) {
      items.push({
        label: t("convList.menu.clearMessages"),
        icon: <Trash2 size={13} />,
        danger: true,
        onClick: () => setConfirmClear(conv),
      });
      items.push({
        label: t("convList.menu.closeAndClear"),
        icon: <Trash2 size={13} />,
        danger: true,
        onClick: () => setConfirmCloseAndClear(conv),
      });
    } else {
      items.push({
        label: t("convList.menu.more"),
        icon: <MoreHorizontal size={13} />,
        children: [
          {
            label: t("convList.menu.clearMessages"),
            icon: <Trash2 size={13} />,
            danger: true,
            onClick: () => setConfirmClear(conv),
          },
          {
            label: t("convList.menu.closeAndClear"),
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
      <div className="flex flex-1 items-center justify-center text-sm text-error">
        {tt("convList.loadFailed")}
      </div>
    );
  }
  if (filtered.length === 0) {
    const emptyText = filter === "follow" ? tt("convList.emptyFollow") : tt("convList.empty");
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
        {emptyText}
      </div>
    );
  }

  return (
    <div ref={listRef} className="flex flex-1 flex-col gap-[1px] overflow-y-auto px-2 py-1">
      <style>{LIST_SKELETON_STYLE}</style>
      {filtered.map((c) => {
        const selected = c.channel.channelID === selectedChannelId;
        return (
          <ConversationRow
            key={conversationDomKey(c)}
            conversation={c}
            active={selected || c.channel.channelID === ctxMenuRowKey}
            suppressDraft={selected}
            myUid={myUid}
            hasThreads={
              c.channel.channelType === ChannelTypeGroup && threadsByParent.has(c.channel.channelID)
            }
            onClick={() => onSelect?.(c)}
            onContextMenu={onRowContextMenu(c)}
            unreadPulseToken={
              recentJumpPulse?.key === conversationDomKey(c) ? recentJumpPulse.token : 0
            }
            rowRef={(node) => {
              const key = conversationDomKey(c);
              if (node) rowRefs.current.set(key, node);
              else rowRefs.current.delete(key);
            }}
          />
        );
      })}

      <ContextMenu
        open={menu.open}
        x={menu.x}
        y={menu.y}
        items={menu.conv ? buildMenuItems(menu.conv) : []}
        onClose={closeContextMenu}
      />

      <ConfirmModal
        open={!!confirmClear}
        title={tt("convList.confirmClearTitle")}
        content={tt("convList.confirmClearContent")}
        okDanger
        okText={tt("convList.clearOk")}
        okLoading={clearMessagesMu.isPending}
        onOk={() => confirmClear && clearMessagesMu.mutate(confirmClear)}
        onCancel={() => setConfirmClear(null)}
      />

      <ConfirmModal
        open={!!confirmClose}
        title={tt("convList.confirmCloseTitle")}
        content={tt("convList.confirmCloseContent")}
        okText={tt("convList.closeOk")}
        okLoading={closeChatMu.isPending}
        onOk={() => confirmClose && closeChatMu.mutate(confirmClose)}
        onCancel={() => setConfirmClose(null)}
      />

      <ConfirmModal
        open={!!confirmCloseAndClear}
        title={tt("convList.confirmCloseAndClearTitle")}
        content={tt("convList.confirmCloseAndClearContent")}
        okText={tt("convList.closeAndClearOk")}
        okDanger
        okLoading={closeChatMu.isPending || clearMessagesMu.isPending}
        onOk={() => {
          if (!confirmCloseAndClear) return;
          clearMessagesMu.mutate(confirmCloseAndClear);
          closeChatMu.mutate(confirmCloseAndClear);
          setConfirmCloseAndClear(null);
        }}
        onCancel={() => setConfirmCloseAndClear(null)}
      />

      {createCategoryOpen ? (
        <InputModal
          open
          title={tt("convList.newCategoryTitle")}
          placeholder={tt("convList.newCategoryPlaceholder")}
          validate={(v) => v.trim().length > 0}
          okLoading={createCategoryMu.isPending}
          onOk={(v) => createCategoryMu.mutate(v)}
          onCancel={() => setCreateCategoryOpen(false)}
        />
      ) : null}
    </div>
  );
}
