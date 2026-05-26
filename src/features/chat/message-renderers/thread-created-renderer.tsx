import { Channel, ChannelTypePerson, type Message } from "wukongimjssdk";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { chatSelectedActions } from "@/features/chat/stores/chat-selected";
import { ThreadCreatedContent } from "@/features/base/im/thread-created-content";

interface ThreadCreatedRendererProps {
  message: Message;
}

/**
 * 子区创建消息渲染(对应旧 dmworkbase Messages/ThreadCreated)。
 *
 * 旧 .wk-thread-created-card css 精确尺寸:
 *   padding 12px / bg rgba(28,28,35,0.04) ≈ text-primary 4% 灰
 *   border-left 4px solid rgba(28,28,35,0.8) — 深色 (text-primary 80%) 不是 brand
 *   border-radius: 0 4px 4px 0 — **只右侧圆角**,左条平直
 *   gap 4px 上下两行
 *
 * 第一行(.preview):14px / 常规字重 / text-primary,2 行省略
 *   内容 = content.content(后端拼好的"NAME 创建了子区「子区名」",fallback 自拼)
 *
 * 第二行(.meta):12px / gap 16px
 *   link:🧵 thread_name·N 条回复(brand 紫 #7f3bf5,旧 brand-primary 全饱和)
 *   avatars:16×16 圆头像,叠加 margin-left -8px(本期简化为单头像 — last_message)
 *
 * 整块可点 → chatSelectedActions.select 进子区。
 */
export function ThreadCreatedRenderer({ message }: ThreadCreatedRendererProps) {
  const c = message.content as ThreadCreatedContent;
  const enter = () => {
    if (!c.channel_id) return;
    chatSelectedActions.select(new Channel(c.channel_id, c.channel_type || 5));
  };
  const previewText = c.content || `${c.from_name || "用户"} 创建了子区「${c.thread_name}」`;
  const messageCount = c.message_count ?? 0;

  return (
    <button
      type="button"
      onClick={enter}
      className="flex w-full max-w-[680px] flex-col gap-1 rounded-r-sm border-l-4 border-text-primary/80 bg-text-primary/[0.04] p-3 text-left transition-colors hover:bg-text-primary/[0.06]"
    >
      <div className="line-clamp-2 text-[14px] leading-[22px] text-text-primary">{previewText}</div>
      <div className="flex items-center gap-4 text-[12px]">
        <span className="truncate text-brand">
          🧵 {c.thread_name}
          {messageCount > 0 ? `·${messageCount} 条回复` : ""}
        </span>
        {c.last_message?.from_uid ? (
          <span className="shrink-0">
            <ChannelAvatar
              channel={new Channel(c.last_message.from_uid, ChannelTypePerson)}
              size={16}
              title={c.last_message.from_name}
            />
          </span>
        ) : null}
      </div>
    </button>
  );
}
