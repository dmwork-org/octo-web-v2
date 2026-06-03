import { Channel, ChannelTypePerson, type Reminder } from "wukongimjssdk";
import { useStore } from "@tanstack/react-store";
import { useTypingForChannel } from "@/features/chat/hooks/use-typing-for-channel.hook";
import { chatDraftStore, selectDraftForChannel } from "@/features/chat/stores/chat-draft";
import {
  chatAiCollabFoldStore,
  selectAiCollabFoldForChannel,
} from "@/features/chat/stores/ai-collab-fold";

interface ConversationTypingDigestProps {
  /** 会话 channel — 取此 channel 的 typing / draft / AI 协作 fold 状态 */
  channel: Channel;
  /** typing 不活跃且无 fold preview / 草稿 时回退渲染(通常是 lastMessage digest 文本)。 */
  fallback: React.ReactNode;
  /**
   * 未完成的 simpleReminders(typing / fold preview 时不显;否则跟 draft / digest 并存)。
   * 老仓 wk-reminder 红字 tag,位置在草稿 label 后、digest 前(对齐
   * ConversationList 行 672-684)。
   */
  reminders?: Reminder[];
  /**
   * 静音多未读 `[N 条]` 红字前缀(typing / fold preview 时不显)。
   * 对齐老仓 wk-conv-count-hint(行 685-690)。
   */
  countHint?: number;
}

/**
 * 会话列表行 second-line 渲染切换器 — 老仓 wk-conversationlist-item-lastmsg 容器。
 *
 * 优先级(对齐老仓 lastContent + 行 691-693):
 *   - typing 中 → 仅 typing label(person:"··· 正在输入" / group:"··· {fromName} 正在输入")
 *   - 否则有 AI 协作 fold preview(chatAiCollabFoldStore)→ "AI协作中 · 参与者 × ··· · N条"
 *     对齐老仓 lastContent 行 379-394 `wk-ai-collab-preview`(渐变 brand+success tag +
 *     绿色 pulse 点 + 灰字 X 连接参与者)
 *   - 否则 → [草稿] label(有 draft) + reminders 红 tag(未完成) + [N 条] 红字 + fallback(digest)
 *     四者并存
 */
export function ConversationTypingDigest({
  channel,
  fallback,
  reminders,
  countHint,
}: ConversationTypingDigestProps) {
  const typing = useTypingForChannel(channel);
  const draft = useStore(chatDraftStore, selectDraftForChannel(channel));
  const fold = useStore(chatAiCollabFoldStore, selectAiCollabFoldForChannel(channel));

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

  if (fold) {
    return (
      <span className="inline-flex min-w-0 items-center gap-1">
        <style>{AI_COLLAB_KEYFRAMES}</style>
        <span className="ai-collab-tag text-accent inline-flex shrink-0 items-center gap-[3px] rounded-sm px-1 text-[10px] font-semibold">
          <span className="ai-collab-pulse bg-success inline-block h-[5px] w-[5px] rounded-full" />
          AI协作中
        </span>
        <span className="min-w-0 truncate text-text-tertiary">
          {fold.participants.join(" × ")} · {fold.count}条
        </span>
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

const AI_COLLAB_KEYFRAMES = `
.ai-collab-tag {
  background: linear-gradient(135deg,
    color-mix(in srgb, var(--color-accent) 12%, transparent),
    color-mix(in srgb, var(--color-success) 12%, transparent));
}
.ai-collab-pulse {
  animation: wk-ai-collab-pulse 2s ease-in-out infinite;
}
@keyframes wk-ai-collab-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(1.4); }
}
`;

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
