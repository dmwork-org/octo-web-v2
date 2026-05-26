import { Channel, type Message } from "wukongimjssdk";
import { ChevronRight, MessageSquarePlus } from "lucide-react";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { chatSelectedActions } from "@/features/chat/stores/chat-selected";
import { ThreadCreatedContent } from "@/features/base/im/thread-created-content";

interface ThreadCreatedRendererProps {
  message: Message;
}

/** "刚刚" / "X 分钟前" / "HH:mm" 简化版,对齐旧 getTimeStringAutoShort2。 */
function timeShort(ts: number): string {
  if (!ts) return "";
  const now = Date.now() / 1000;
  const diff = now - ts;
  if (diff < 60) return "刚刚";
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  const d = new Date(ts * 1000);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * 子区创建消息渲染(对应旧 dmworkbase Messages/ThreadCreated):
 *
 *   ┌─────────────────────────────────┐
 *   │ ✦ X 创建了子区               › │  ← 顶部标题(创建人 + 动作)
 *   │ ──────────────────────────── │
 *   │ 「子区名称」                    │
 *   │ 8 条消息 · 最近 3 分钟前          │  ← 元数据
 *   │ ──────────────────────────── │
 *   │ Y: 最后一条消息内容...           │  ← last_message 预览
 *   └─────────────────────────────────┘
 *
 * 点击 → chatSelectedActions.select 进入子区频道。
 */
export function ThreadCreatedRenderer({ message }: ThreadCreatedRendererProps) {
  const c = message.content as ThreadCreatedContent;
  const enter = () => {
    if (!c.channel_id) return;
    chatSelectedActions.select(new Channel(c.channel_id, c.channel_type || 5));
  };

  return (
    <button
      type="button"
      onClick={enter}
      className="flex w-72 flex-col overflow-hidden rounded-md border border-border-subtle bg-bg-surface text-left shadow-sm transition-colors hover:bg-bg-hover"
    >
      <header className="flex items-center gap-2 border-b border-border-subtle px-3 py-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-brand-tint text-brand">
          <MessageSquarePlus size={12} />
        </span>
        <span className="min-w-0 flex-1 truncate text-[12px] text-text-secondary">
          <span className="font-medium text-text-primary">{c.from_name || "有人"}</span>
          创建了子区
        </span>
        <ChevronRight size={14} className="shrink-0 text-text-tertiary" />
      </header>

      <div className="flex flex-col gap-1 px-3 py-2">
        <div className="truncate text-[13px] font-semibold text-text-primary">{c.thread_name}</div>
        <div className="flex items-center gap-1.5 text-[11px] text-text-tertiary">
          {typeof c.message_count === "number" ? <span>{c.message_count} 条消息</span> : null}
          {c.last_message?.timestamp ? (
            <>
              <span>·</span>
              <span>最近 {timeShort(c.last_message.timestamp)}</span>
            </>
          ) : null}
        </div>
      </div>

      {c.last_message?.content ? (
        <div className="flex items-center gap-2 border-t border-border-subtle px-3 py-2">
          <ChannelAvatar
            channel={new Channel(c.last_message.from_uid, 1)}
            size={20}
            title={c.last_message.from_name}
          />
          <span className="min-w-0 flex-1 truncate text-[11px] text-text-secondary">
            <span className="font-medium text-text-primary">{c.last_message.from_name}: </span>
            {c.last_message.content}
          </span>
        </div>
      ) : null}
    </button>
  );
}
