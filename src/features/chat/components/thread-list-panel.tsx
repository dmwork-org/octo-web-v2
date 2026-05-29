import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Channel } from "wukongimjssdk";
import { Hash, MessageCircle, X } from "lucide-react";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { chatSelectedActions } from "@/features/chat/stores/chat-selected";
import { listThreads, type ThreadRaw } from "@/features/base/api/endpoints/group.api";
import { buildThreadChannelId } from "@/features/base/im/parse-thread-channel-id";

interface ThreadListPanelProps {
  open: boolean;
  /** 父群 channel(groupNo 取自 channel.channelID)。 */
  groupNo: string;
  onClose: () => void;
}

/** ChannelType 5 = ChannelTypeCommunityTopic。 */
const CHANNEL_TYPE_THREAD = 5;

/**
 * 子区列表 panel(对应旧 dmworkbase ThreadList + Pages/Chat showThreadPanel):
 *
 * chat-header 右上"子区"按钮 toggle,显示该群下所有子区(name / 回复数 / 最近)。
 * click 进子区(chatSelectedActions.select,channelID = `groupNo____shortId`)。
 *
 * 创建子区入口:旧版 ThreadList 顶部 + 号,新版本期 skip(子区从消息右键创建是
 * 主路径,顶部创建留 P4+)。
 */
export function ThreadListPanel({ open, groupNo, onClose }: ThreadListPanelProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["chat", "thread-list", groupNo],
    queryFn: () => listThreads(groupNo, { page_index: 1, page_size: 100 }),
    enabled: open,
    staleTime: 30 * 1000,
  });

  if (!open) return null;

  return (
    <aside className="absolute top-14 right-0 z-30 flex h-[calc(100%-3.5rem)] w-80 flex-col border-l border-border-subtle bg-bg-surface shadow-lg">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border-subtle px-4">
        <h3 className="text-sm font-semibold text-text-primary">子区</h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭子区列表"
          className="flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
        >
          <X size={16} />
        </button>
      </header>

      <div className="flex flex-1 flex-col overflow-y-auto">
        {isLoading ? (
          <div className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
            加载中…
          </div>
        ) : error ? (
          <div className="flex flex-1 items-center justify-center text-sm text-error">
            子区加载失败
          </div>
        ) : !data || data.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-sm text-text-tertiary">
            <Hash size={28} className="text-text-quaternary" />
            <span>暂无子区</span>
            <span className="text-xs">在消息上右键 → "创建子区" 开始</span>
          </div>
        ) : (
          data.map((t: ThreadRaw) => (
            <ThreadRow key={t.short_id} thread={t} groupNo={groupNo} onSelect={onClose} />
          ))
        )}
      </div>
    </aside>
  );
}

function ThreadRow({
  thread,
  groupNo,
  onSelect,
}: {
  thread: ThreadRaw;
  groupNo: string;
  onSelect: () => void;
}) {
  const [_hover, setHover] = useState(false);
  const channelId = buildThreadChannelId(groupNo, thread.short_id);
  const channel = new Channel(channelId, CHANNEL_TYPE_THREAD);
  const messageCount = thread.message_count ?? 0;
  const onClick = () => {
    chatSelectedActions.select(channel);
    onSelect();
  };
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="flex w-full items-start gap-3 border-b border-border-subtle/50 px-4 py-3 text-left transition-colors hover:bg-bg-hover"
    >
      <ChannelAvatar channel={channel} size={32} title={thread.name} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium text-text-primary">{thread.name}</span>
        <div className="flex items-center gap-2 text-[11px] text-text-tertiary">
          <span className="inline-flex items-center gap-0.5">
            <MessageCircle size={12} />
            {messageCount} 条回复
          </span>
          {thread.creator_name ? <span>· {thread.creator_name}</span> : null}
        </div>
        {thread.last_message_content ? (
          <span className="truncate text-[12px] text-text-secondary">
            {thread.last_message_sender_name ? `${thread.last_message_sender_name}: ` : ""}
            {thread.last_message_content}
          </span>
        ) : null}
      </div>
    </button>
  );
}
