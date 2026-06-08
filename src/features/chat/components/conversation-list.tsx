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
  onClick,
  onContextMenu,
}: {
  conversation: Conversation;
  active: boolean;
  myUid: string;
  onClick: () => void;
  onContextMenu: (e: MouseEvent) => void;
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
      type="button"
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={`mb-[1px] flex w-full items-center gap-[10px] rounded-md px-2 py-[7px] text-left transition-colors duration-150 ease-(--ease-emphasized) ${
        active ? "bg-[rgba(28,28,35,0.06)]" : "hover:bg-[rgba(46,50,56,0.09)]"
      }`}
    >
      <div className="relative h-8 w-8 shrink-0">
        <ChannelAvatar channel={avatarChannel} size={32} title={avatarTitle} />
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
        {hasUnread &&
          (isMuted ? (
            <span
              aria-hidden
              className="absolute -top-[2px] -right-[2px] box-border h-[9px] w-[9px] rounded-full border-2 border-bg-base bg-error"
            />
          ) : (
            <span
              aria-label={tt("convList.unreadAria", { values: { count: conversation.unread } })}
              className="absolute -top-[6px] -right-[6px] box-border inline-flex h-4 min-w-4 items-center justify-center rounded-[9px] border-2 border-bg-base bg-error px-1 text-[10px] leading-none font-semibold text-white"
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

const RECENT_INACTIVE_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000;
function isVisibleInRecentTab(c: Conversation, now: number): boolean {
  if (c.channel.channelType !== ChannelTypeGroup) return true;
  return now - (c.timestamp || 0) * 1000 < RECENT_INACTIVE_THRESHOLD_MS;
}

const TOP_BOOST = 1_000_000_000_000;

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
      if (chatSelectedStore.state.channel?.channelID === conv.channel.channelID) {
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
    setMenu({ open: true, x: e.clientX, y: e.clientY, conv });
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
    const isTop = !!conv.channelInfo?.top || conv.extra?.top === 1;
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
    <div className="flex flex-1 flex-col gap-[1px] overflow-y-auto px-2 py-1">
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
