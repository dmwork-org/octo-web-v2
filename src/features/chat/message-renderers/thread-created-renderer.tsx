import { Channel, type Message } from "wukongimjssdk";
import { Hash } from "lucide-react";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { chatSelectedActions } from "@/features/chat/stores/chat-selected";
import { ThreadCreatedContent } from "@/features/base/im/thread-created-content";

interface ThreadCreatedRendererProps {
  message: Message;
}

/**
 * 子区创建消息渲染(对应旧 dmworkbase Messages/ThreadCreated):
 *
 * 整体灰底块 + 左侧 4px brand 色条;两行 inline:
 *
 *   ┌─┬───────────────────────────────────────────────┐
 *   │ │  许建文 创建了子区「web 升级讨论」              │
 *   │ │  # web 升级讨论·5 条回复  (头像)               │
 *   └─┴───────────────────────────────────────────────┘
 *    ↑ brand 色 4px 竖条
 *
 * 文字 brand 紫色(整块可点 → chatSelectedActions.select 进子区)。
 */
export function ThreadCreatedRenderer({ message }: ThreadCreatedRendererProps) {
  const c = message.content as ThreadCreatedContent;
  const enter = () => {
    if (!c.channel_id) return;
    chatSelectedActions.select(new Channel(c.channel_id, c.channel_type || 5));
  };
  const lastFromName = c.last_message?.from_name || c.from_name;

  return (
    <button
      type="button"
      onClick={enter}
      className="flex w-full max-w-2xl items-stretch gap-3 overflow-hidden rounded-md bg-bg-elevated text-left transition-colors hover:bg-bg-hover"
    >
      <span className="w-1 shrink-0 bg-brand" aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 py-2.5 pr-3">
        <div className="truncate text-[14px] leading-tight text-text-primary">
          <span className="font-medium">{c.from_name || "有人"}</span>
          <span> 创建了子区</span>
          <span className="font-medium">「{c.thread_name}」</span>
        </div>
        <div className="flex items-center gap-1.5 text-[12px] leading-tight text-brand">
          <Hash size={13} className="shrink-0" />
          <span className="truncate">
            {c.thread_name}
            {typeof c.message_count === "number" ? `·${c.message_count} 条回复` : ""}
          </span>
          {c.last_message?.from_uid ? (
            <ChannelAvatar
              channel={new Channel(c.last_message.from_uid, 1)}
              size={16}
              title={lastFromName}
            />
          ) : null}
        </div>
      </div>
    </button>
  );
}
