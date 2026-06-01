import { Channel, ChannelTypePerson, type Message } from "wukongimjssdk";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { chatSelectedActions } from "@/features/chat/stores/chat-selected";
import { toast } from "@/components/semi-bridge/toast";
import { getThread } from "@/features/base/api/endpoints/group.api";
import { parseThreadChannelId } from "@/features/base/im/parse-thread-channel-id";
import { ThreadCreatedContent } from "@/features/base/im/thread-created-content";

interface ThreadCreatedRendererProps {
  message: Message;
}

// 旧 ThreadStatus: 1=活跃 2=归档 3=删除
const THREAD_STATUS_DELETED = 3;

/**
 * 子区创建消息渲染(对应旧 dmworkbase Messages/ThreadCreated)。
 *
 * 旧 .wk-thread-created-card CSS:
 *   padding 12px / bg rgba(28,28,35,0.04) / border-left 4px rgba(28,28,35,0.8)
 *   border-radius 0 4px 4px 0(只右侧)/ gap 4px / max-w 680
 *
 * 第一行 preview:14px text-primary,2 行省略;content fallback 自拼。
 * 第二行 meta:12px / gap 16px / link 紫色 #7f3bf5 / 参与者头像组(最多 3,叠加)
 *
 * 整块 cursor-pointer + click 进子区。点击前先校验子区状态(对齐旧 ThreadCreated
 * handleClick line 73-89):API 404 → "该子区已删除或不存在";status=3 → "该子区已删除"。
 */
export function ThreadCreatedRenderer({ message }: ThreadCreatedRendererProps) {
  const c = message.content as ThreadCreatedContent;
  const enter = async () => {
    if (!c.channel_id) return;
    const parsed = parseThreadChannelId(c.channel_id);
    if (parsed) {
      try {
        const thread = await getThread(parsed.groupNo, parsed.shortId);
        if (thread.status === THREAD_STATUS_DELETED) {
          toast.warning("该子区已删除");
          return;
        }
        // 归档(status=2)允许进入查看,聊天界面禁用发送由 channel 层处理
      } catch {
        toast.warning("该子区已删除或不存在");
        return;
      }
    }
    chatSelectedActions.select(new Channel(c.channel_id, c.channel_type || 5));
  };
  const previewText = c.content || `${c.from_name || "用户"} 创建了子区「${c.thread_name}」`;
  const messageCount = c.message_count ?? 0;

  // 参与者头像:优先 content.participants(slice 0,3);fallback last_message.from_uid 单头像
  const participantUids =
    c.participants && c.participants.length > 0
      ? c.participants
          .slice(0, 3)
          .map((p) => p.uid)
          .filter(Boolean)
      : c.last_message?.from_uid
        ? [c.last_message.from_uid]
        : [];

  return (
    <button
      type="button"
      onClick={enter}
      className="flex w-full max-w-[680px] cursor-pointer flex-col gap-1 rounded-r-sm border-l-4 border-text-primary/80 bg-text-primary/[0.04] p-3 text-left transition-colors hover:bg-text-primary/[0.06]"
    >
      <div className="line-clamp-2 text-[14px] leading-[22px] text-text-primary">{previewText}</div>
      <div className="flex items-center gap-4 text-[12px]">
        <span className="truncate text-[#7f3bf5]">
          🧵 {c.thread_name}
          {messageCount > 0 ? `·${messageCount} 条回复` : ""}
        </span>
        {participantUids.length > 0 ? (
          <span className="flex shrink-0 items-center">
            {participantUids.map((uid, idx) => (
              <span
                key={uid}
                className="rounded-full border-[1.5px] border-bg-surface"
                style={{ marginLeft: idx === 0 ? 0 : -6, zIndex: participantUids.length - idx }}
              >
                <ChannelAvatar channel={new Channel(uid, ChannelTypePerson)} size={16} title="" />
              </span>
            ))}
          </span>
        ) : null}
      </div>
    </button>
  );
}
