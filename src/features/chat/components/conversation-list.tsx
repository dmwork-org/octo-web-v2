import { useMemo, useState, type MouseEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import WKSDK, {
  Channel,
  type Conversation,
  ChannelTypeGroup,
  ChannelTypePerson,
} from "wukongimjssdk";
import { BellOff, BellRing, Eye, FolderInput, Pin, PinOff, Star, Trash2, X } from "lucide-react";
import { authStore } from "@/features/base/stores/auth";
import { spaceStore } from "@/features/base/stores/space";
import { toast } from "@/components/semi-bridge/toast";
import { ContextMenu, type ContextMenuItem } from "@/features/base/components/context-menu";
import { ConfirmModal } from "@/features/base/components/modals/confirm-modal";
import { parseThreadChannelId } from "@/features/base/im/parse-thread-channel-id";
import {
  clearChannelMessages,
  clearConversationUnread,
  deleteConversation,
} from "@/features/base/api/endpoints/conversation.api";
import { setChannelMute, setChannelTop } from "@/features/base/api/endpoints/channel-setting.api";
import {
  followDM,
  moveGroupToCategory,
  unfollowChannel,
} from "@/features/base/api/endpoints/follow.api";
import { AiBadge } from "@/features/base/components/badges/ai-badge";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { ConversationOnlineBadge } from "@/features/chat/components/conversation-online-badge";
import { ConversationTypingDigest } from "@/features/chat/components/conversation-typing-digest";
import {
  categoriesQueryKey,
  categoriesQueryOptions,
} from "@/features/chat/queries/categories.query";
import { conversationsQueryOptions } from "@/features/chat/queries/conversations.query";
import { useConversationsSync } from "@/features/chat/hooks/use-conversations-sync.hook";
import { chatSelectedActions, chatSelectedStore } from "@/features/chat/stores/chat-selected";
import {
  effectiveMute,
  isMentionMe,
  lastMessageDigest,
} from "@/features/chat/lib/conversation-last-content";

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

function timeLabel(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
  const sameYear = d.getFullYear() === now.getFullYear();
  if (sameYear) return `${d.getMonth() + 1}/${d.getDate()}`;
  return `${d.getFullYear() % 100}/${d.getMonth() + 1}/${d.getDate()}`;
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
  const isTop = conversation.extra?.top === 1 || !!info?.top;
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
  const title = orgData?.displayName || info?.title || channel.channelID;
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
    void WKSDK.shared().channelManager.fetchChannelInfo(parentChannel);
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
    <button
      type="button"
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={`flex w-full items-center gap-2.5 rounded-sm px-2 py-[7px] text-left transition-colors duration-150 ease-(--ease-emphasized) ${
        active
          ? "bg-brand-tint"
          : isTop
            ? "bg-bg-elevated/40 hover:bg-bg-hover"
            : "hover:bg-bg-hover"
      }`}
    >
      <div className="relative flex h-8 w-8 shrink-0">
        <ChannelAvatar channel={avatarChannel} size={32} title={avatarTitle} />
        {/* 头像右下:子区 # 角标(优先) / person 在线点(互斥,person 不会有 #) */}
        {isThread ? (
          <span
            aria-hidden
            className="absolute -right-[3px] -bottom-[3px] flex h-4 w-4 items-center justify-center rounded-full border-[1.5px] border-bg-base bg-bg-elevated text-text-secondary"
          >
            <span className="text-[10px] leading-none">#</span>
          </span>
        ) : showOnline ? (
          <ConversationOnlineBadge />
        ) : null}
        {/* 头像右上未读:静音红点 / 非静音数字胶囊 */}
        {hasUnread &&
          (isMuted ? (
            <span
              aria-hidden
              className="absolute -top-[2px] -right-[2px] h-[9px] w-[9px] rounded-full border-2 border-bg-base bg-error box-border"
            />
          ) : (
            <span
              aria-label={`${conversation.unread} 条未读`}
              className="absolute -top-[6px] -right-[6px] inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-error px-1 text-[10px] font-bold text-text-inverse ring-2 ring-bg-base"
            >
              {unread}
            </span>
          ))}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {breadcrumb ? (
          <span className="truncate text-[10px] leading-tight text-text-tertiary">
            {breadcrumb}
          </span>
        ) : null}
        <div className="flex items-center justify-between gap-2">
          <h3
            className={`flex min-w-0 flex-1 items-center gap-1 truncate text-[13px] leading-tight ${
              hasUnread && !isMuted ? "font-semibold" : "font-medium"
            } ${isMuted ? "text-text-tertiary" : "text-text-primary"}`}
          >
            <span className="min-w-0 truncate">{title}</span>
            {isBot ? <AiBadge size="small" /> : null}
            {isExternal ? (
              <span className="shrink-0 rounded-sm bg-brand-tint px-1 text-[10px] font-medium text-brand-primary">
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
              <BellOff size={11} aria-label="免打扰" className="shrink-0 text-text-tertiary" />
            ) : null}
          </h3>
          <div className="flex shrink-0 items-center gap-1 text-text-tertiary">
            {isTop ? <Pin size={11} aria-label="置顶" /> : null}
            <span className="text-[11px] leading-none">{timeLabel(conversation.timestamp)}</span>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span
            className={`flex min-w-0 flex-1 items-center gap-1 truncate text-xs leading-tight ${
              isMuted ? "text-text-tertiary" : "text-text-secondary"
            }`}
          >
            {showCountHint ? (
              <span className="shrink-0 font-medium text-error">
                [{conversation.unread > 99 ? "99+" : conversation.unread} 条]
              </span>
            ) : null}
            <ConversationTypingDigest channel={channel} fallback={digest} />
          </span>
          {mentionMe && hasUnread && !isMuted ? (
            <span className="shrink-0 rounded-sm bg-error px-1 text-[10px] font-semibold text-text-inverse">
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
 * 右键菜单(对齐旧 ConversationList::menus):
 *   - 标为已读(unread > 0 时)
 *   - 置顶 / 取消置顶
 *   - 开启 / 关闭免打扰
 *   - 取消关注(group only,接 /follow/channel/unfollow)
 *   - 清空聊天记录(danger,Confirm)
 *   - 关闭聊天窗口(从列表移除该会话,Confirm)
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

  const [menu, setMenu] = useState<{ open: boolean; x: number; y: number; conv?: Conversation }>({
    open: false,
    x: 0,
    y: 0,
  });
  const [confirmClear, setConfirmClear] = useState<Conversation | null>(null);
  const [confirmClose, setConfirmClose] = useState<Conversation | null>(null);

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

  // 取消关注群(对应旧 dmworkbase FollowService.unfollowChannel)
  const unfollowMu = useMutation({
    mutationFn: (groupNo: string) => unfollowChannel(groupNo),
    onSuccess: () => {
      // categories(关注 tab)和 conversations 都可能变(关注关系移除)— 双 invalidate
      void qc.invalidateQueries({ queryKey: categoriesQueryKey(spaceId) });
      void qc.invalidateQueries({ queryKey: ["chat", "conversations", spaceId ?? "_"] });
      toast.success("已取消关注");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "取消关注失败"),
  });

  // 关注 DM(对齐旧 FollowService.followDM,把 person 加到关注 tab 默认分组)
  const followDmMu = useMutation({
    mutationFn: (peerUid: string) => followDM(peerUid, null),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: categoriesQueryKey(spaceId) });
      toast.success("已关注");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "关注失败"),
  });

  // 移动群到分组(对齐旧 CategoryService.moveGroupToCategory)
  const moveCatMu = useMutation({
    mutationFn: (args: { groupNo: string; categoryId: string }) =>
      moveGroupToCategory(args.groupNo, args.categoryId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: categoriesQueryKey(spaceId) });
      toast.success("已移动");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "移动失败"),
  });

  // 分组列表(给"移动到分组"子菜单用)— 关注 tab 同款 query
  const categoriesQ = useQuery({
    ...categoriesQueryOptions(spaceId),
    enabled: !!spaceId,
  });

  // ─── Right-click menu ──────────────────────────────────

  const onRowContextMenu = (conv: Conversation) => (e: MouseEvent) => {
    e.preventDefault();
    setMenu({ open: true, x: e.clientX, y: e.clientY, conv });
  };

  const buildMenuItems = (conv: Conversation): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [];
    const isMuted = !!conv.channelInfo?.mute;
    const isTop = !!conv.channelInfo?.top || conv.extra?.top === 1;
    const isGroup = conv.channel.channelType === ChannelTypeGroup;
    const isPerson = conv.channel.channelType === ChannelTypePerson;

    if (conv.unread > 0) {
      items.push({
        label: "标为已读",
        icon: <Eye size={13} />,
        onClick: () => clearUnreadMu.mutate(conv),
      });
    }
    items.push({
      label: isTop ? "取消置顶" : "置顶聊天",
      icon: isTop ? <PinOff size={13} /> : <Pin size={13} />,
      onClick: () => topMu.mutate({ conv, top: !isTop }),
    });
    items.push({
      label: isMuted ? "关闭免打扰" : "开启免打扰",
      icon: isMuted ? <BellRing size={13} /> : <BellOff size={13} />,
      onClick: () => muteMu.mutate({ conv, mute: !isMuted }),
    });

    if (isPerson) {
      items.push({ separator: true });
      items.push({
        label: "关注此人",
        icon: <Star size={13} />,
        onClick: () => followDmMu.mutate(conv.channel.channelID),
      });
    }

    if (isGroup) {
      items.push({ separator: true });
      // 移动到分组 — 二级子菜单列各 category(对齐旧 ContextMenu.moveToCategory)
      const cats = categoriesQ.data ?? [];
      const groupNo = conv.channel.channelID;
      const moveChildren: ContextMenuItem[] = cats.map((cat) => ({
        label: cat.name,
        onClick: () => {
          if (!cat.category_id) return;
          moveCatMu.mutate({ groupNo, categoryId: cat.category_id });
        },
      }));
      if (moveChildren.length > 0) {
        items.push({
          label: "移动到分组",
          icon: <FolderInput size={13} />,
          children: moveChildren,
        });
      }
      items.push({
        label: "取消关注",
        icon: <Star size={13} />,
        onClick: () => unfollowMu.mutate(conv.channel.channelID),
      });
    }
    items.push({ separator: true });
    items.push({
      label: "清空聊天记录",
      icon: <Trash2 size={13} />,
      danger: true,
      onClick: () => setConfirmClear(conv),
    });
    items.push({
      label: "关闭聊天窗口",
      icon: <X size={13} />,
      onClick: () => setConfirmClose(conv),
    });
    return items;
  };

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
        加载会话…
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
    <div className="flex flex-1 flex-col gap-[1px] overflow-y-auto p-2">
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
    </div>
  );
}
