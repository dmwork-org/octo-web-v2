import { useQuery } from "@tanstack/react-query";
import { type Conversation, ChannelTypePerson } from "wukongimjssdk";
import { conversationsQueryOptions } from "@/features/chat/queries/conversations.query";
import { useConversationsSync } from "@/features/chat/hooks/use-conversations-sync.hook";

interface ConversationListProps {
  selectedChannelId?: string;
  onSelect?: (conversation: Conversation) => void;
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
 * 视觉(P2-C1):
 * - 行 padding 7px 8px / rounded-sm(6px) / hover bg-bg-hover / selected bg-brand-tint
 * - 头像 32×32:DM 圆形 / Group 圆角 6px
 * - 头像右上 unread badge(>=1 数字 / 静音改红点)
 * - 名字 13px / 未读 semibold / 静音 muted
 * - 第二行:digest 单行截断 + 时间 right-align
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
  const hasUnread = conversation.unread > 0;
  const unread = unreadBadge(conversation.unread);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-sm px-2 py-[7px] text-left transition-colors duration-150 ease-(--ease-emphasized) ${
        active ? "bg-brand-tint" : "hover:bg-bg-hover"
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
          <span className="shrink-0 text-[11px] leading-none text-text-tertiary">
            {timeLabel(conversation.timestamp)}
          </span>
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

export function ConversationList({ selectedChannelId, onSelect }: ConversationListProps) {
  useConversationsSync();
  const { data, isLoading, error } = useQuery(conversationsQueryOptions());

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
  const list = data ?? [];
  if (list.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
        暂无会话
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-[1px] overflow-y-auto p-2">
      {list.map((c) => (
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
