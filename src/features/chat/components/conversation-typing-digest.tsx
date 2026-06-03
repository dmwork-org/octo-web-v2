import { Channel, ChannelTypePerson, type Reminder } from "wukongimjssdk";
import { useStore } from "@tanstack/react-store";
import { useTypingForChannel } from "@/features/chat/hooks/use-typing-for-channel.hook";
import { chatDraftStore, selectDraftForChannel } from "@/features/chat/stores/chat-draft";

interface ConversationTypingDigestProps {
  /** 会话 channel — 取此 channel 的 typing / draft 状态 */
  channel: Channel;
  /** typing 不活跃且无草稿时回退渲染(通常是 lastMessage digest 文本)。 */
  fallback: React.ReactNode;
  /**
   * 未完成的 simpleReminders(typing 时不显;非 typing 时跟 draft / digest 并存)。
   * 老仓 wk-reminder 红字 tag,位置在草稿 label 后、digest 前(对齐
   * ConversationList 行 672-684)。
   */
  reminders?: Reminder[];
  /**
   * 静音多未读 `[N 条]` 红字前缀(typing 时不显;调用方按 isMuted && unread>1 控)。
   * 对齐老仓 wk-conv-count-hint(行 685-690)。
   */
  countHint?: number;
}

/**
 * 会话列表行 second-line 渲染切换器 — 老仓 wk-conversationlist-item-lastmsg 容器。
 *
 * 优先级:
 *   - typing 中 → 仅 typing label(person:"··· 正在输入" / group:"··· {fromName} 正在输入")
 *     对齐老仓 _getTypingUI 行 362-364
 *   - 否则 → [草稿] label(有 draft) + reminders 红 tag(未完成) + [N 条] 红字 + fallback(digest)
 *     四者并存(对齐老仓行 660-693:`!typing ? <[草稿]>` + `!typing ? simpleReminders.map` +
 *     `[N条]` + lastContent)
 */
export function ConversationTypingDigest({
  channel,
  fallback,
  reminders,
  countHint,
}: ConversationTypingDigestProps) {
  const typing = useTypingForChannel(channel);
  const draft = useStore(chatDraftStore, selectDraftForChannel(channel));

  if (typing) {
    const isGroup = channel.channelType !== ChannelTypePerson;
    const label = isGroup && typing.fromName ? `${typing.fromName} 正在输入` : "正在输入";
    return (
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <style>{TYPING_DIGEST_KEYFRAMES}</style>
        <span className="inline-flex items-center gap-[3px]">
          <span className="wk-typing-digest-dot" />
          <span className="wk-typing-digest-dot" />
          <span className="wk-typing-digest-dot" />
        </span>
        <span className="truncate">{label}</span>
      </span>
    );
  }

  const undoneReminders = reminders?.filter((r) => !r.done) ?? [];
  const hasDraft = !!draft && draft.trim() !== "";
  const showCountHint = countHint != null && countHint > 0;

  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      {hasDraft ? <span className="shrink-0 text-xs font-medium text-error">[草稿]</span> : null}
      {undoneReminders.map((r) => (
        <span key={r.reminderID} className="shrink-0 text-xs font-medium text-error">
          {r.text ?? ""}
        </span>
      ))}
      {showCountHint ? (
        <span className="shrink-0 font-medium text-error">
          [{countHint > 99 ? "99+" : countHint} 条]
        </span>
      ) : null}
      {hasDraft ? (
        <span className="min-w-0 truncate">{draft}</span>
      ) : (
        <span className="min-w-0 flex-1 truncate">{fallback}</span>
      )}
    </span>
  );
}

const TYPING_DIGEST_KEYFRAMES = `
.wk-typing-digest-dot {
  display: inline-block;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background-color: #6b7075;
  opacity: 0.4;
  animation: wk-typing-digest-bounce 1s infinite ease-in-out both;
}
.wk-typing-digest-dot:nth-child(1) { animation-delay: -0.32s; }
.wk-typing-digest-dot:nth-child(2) { animation-delay: -0.16s; }
.wk-typing-digest-dot:nth-child(3) { animation-delay: 0s; }

@keyframes wk-typing-digest-bounce {
  0%, 80%, 100% { opacity: 0.4; transform: scale(1); }
  40% { opacity: 1; transform: scale(1.3); }
}
`;
