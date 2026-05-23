import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { type Conversation, ChannelTypePerson, ChannelTypeGroup } from "wukongimjssdk";
import { Pin, BellOff } from "lucide-react";
import { conversationsQueryOptions } from "@/features/chat/queries/conversations.query";
import { useConversationsSync } from "@/features/chat/hooks/use-conversations-sync.hook";

export type ConvTab = "follow" | "recent";

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

function digestOf(c: Conversation): string {
  const last = c.lastMessage;
  if (!last) return "";
  const digest = (last.content as { conversationDigest?: string } | undefined)?.conversationDigest;
  return digest ?? "";
}

/**
 * 单行会话(对应旧 .wk-conversationlist-item)。
 *
 * 视觉(P2-C1 + 置顶/免打扰指示):
 * - 行 padding 7px 8px / rounded-sm / hover bg-bg-hover / selected bg-brand-tint
 * - 置顶行额外 bg-bg-elevated/30(微底色,旧项目同样区分)
 * - 头像 32×32:DM 圆形 / Group 圆角 6px;头像右上 unread badge / 静音点
 * - 名字行末尾:置顶 Pin icon(14px text-tertiary) + 免打扰 BellOff icon
 * - digest 单行截断 + 时间 right-align
 */
function ConversationRow({
  conversation,
  active,
  onClick,
}: {
  conversation: Conversation;
  active: boolean;
  onClick: () => void;
}) {
  const title = conversation.channelInfo?.title ?? conversation.channel.channelID;
  const isPerson = conversation.channel.channelType === ChannelTypePerson;
  const isMuted = !!conversation.channelInfo?.mute;
  const isTop = conversation.extra?.top === 1;
  const hasUnread = conversation.unread > 0;
  const unread = unreadBadge(conversation.unread);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-sm px-2 py-[7px] text-left transition-colors duration-150 ease-(--ease-emphasized) ${
        active
          ? "bg-brand-tint"
          : isTop
            ? "bg-bg-elevated/40 hover:bg-bg-hover"
            : "hover:bg-bg-hover"
      }`}
    >
      <div className="relative flex h-8 w-8 shrink-0">
        <div
          className={`flex h-8 w-8 items-center justify-center ${
            isPerson ? "rounded-full" : "rounded-sm"
          } bg-bg-elevated text-xs font-medium text-text-secondary`}
        >
          {title.slice(0, 1).toUpperCase()}
        </div>
        {hasUnread &&
          (isMuted ? (
            <span
              aria-hidden
              className="absolute -top-[2px] -right-[2px] h-[9px] w-[9px] rounded-full bg-error ring-2 ring-bg-base"
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
        <div className="flex items-center justify-between gap-2">
          <h3
            className={`min-w-0 flex-1 truncate text-[13px] leading-tight ${
              hasUnread && !isMuted ? "font-semibold" : "font-medium"
            } ${isMuted ? "text-text-tertiary" : "text-text-primary"}`}
          >
            {title}
          </h3>
          <div className="flex shrink-0 items-center gap-1 text-text-tertiary">
            {isMuted ? <BellOff size={11} aria-label="免打扰" /> : null}
            {isTop ? <Pin size={11} aria-label="置顶" /> : null}
            <span className="text-[11px] leading-none">{timeLabel(conversation.timestamp)}</span>
          </div>
        </div>
        <div className="flex items-center">
          <span
            className={`truncate text-xs leading-tight ${
              isMuted ? "text-text-tertiary" : "text-text-secondary"
            }`}
          >
            {digestOf(conversation)}
          </span>
        </div>
      </div>
    </button>
  );
}

/**
 * "最近"Tab:群聊超过 3 天无消息隐藏;DM / 子区 不过滤。
 * 对应旧 ChatConversationList::isVisibleInRecentTab(packages/dmworkbase/.../ChatConversationList/index.tsx)。
 */
const RECENT_INACTIVE_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000;
function isVisibleInRecentTab(c: Conversation, now: number): boolean {
  if (c.channel.channelType !== ChannelTypeGroup) return true;
  return now - (c.timestamp || 0) * 1000 < RECENT_INACTIVE_THRESHOLD_MS;
}

/**
 * 排序:置顶(extra.top===1) 提到最上,其余按 timestamp 倒序。
 * 对应旧 ChatVM::sortConversations(packages/dmworkbase/src/Pages/Chat/vm.ts:387)。
 */
const TOP_BOOST = 1_000_000_000_000;
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
  useConversationsSync();
  const { data, isLoading, error } = useQuery(conversationsQueryOptions());

  const filtered = useMemo(() => {
    const all = data ?? [];
    if (filter === "follow") {
      // P3-C21 接 follow/分组系统前,先返回空 — 由调用方渲染 placeholder
      return [];
    }
    // recent: 按时间倒序(置顶提到最上) + 3 天不活跃群聊过滤
    const now = Date.now();
    return sortConversations(all.filter((c) => isVisibleInRecentTab(c, now)));
  }, [data, filter]);

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
    const emptyText = filter === "follow" ? "P3-C21 接入分组系统" : "暂无会话";
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
          onClick={() => onSelect?.(c)}
        />
      ))}
    </div>
  );
}
