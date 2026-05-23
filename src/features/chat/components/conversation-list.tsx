import { useQuery } from "@tanstack/react-query";
import { type Conversation } from "wukongimjssdk";
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
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function digestOf(c: Conversation): string {
  const last = c.lastMessage;
  if (!last) return "";
  const digest = (last.content as { conversationDigest?: string } | undefined)?.conversationDigest;
  return digest ?? "";
}

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
  const unread = unreadBadge(conversation.unread);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors ${
        active ? "bg-bg-selected" : "hover:bg-bg-hover"
      }`}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-bg-elevated text-sm font-medium text-text-secondary">
        {title.slice(0, 1).toUpperCase()}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-baseline justify-between">
          <span className="truncate text-sm font-medium text-text-primary">{title}</span>
          <span className="ml-2 shrink-0 text-[11px] text-text-tertiary">
            {timeLabel(conversation.timestamp)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="truncate text-xs text-text-secondary">{digestOf(conversation)}</span>
          {unread && (
            <span className="ml-2 inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-error px-1 text-[10px] font-bold text-text-inverse">
              {unread}
            </span>
          )}
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
    <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
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
