import type { Channel } from "wukongimjssdk";
import { useStore } from "@tanstack/react-store";
import { useTypingForChannel } from "@/features/chat/hooks/use-typing-for-channel.hook";
import { chatDraftStore, selectDraftForChannel } from "@/features/chat/stores/chat-draft";

interface ConversationTypingDigestProps {
  /** 会话 channel — 取此 channel 的 typing / draft 状态 */
  channel: Channel;
  /** typing 不活跃且无草稿时回退渲染(通常是 lastMessage digest 文本)。 */
  fallback: React.ReactNode;
}

/**
 * 会话列表行 "lastMessage 摘要 ↔ 正在输入 ↔ 草稿" 切换器:
 *   - typing 中(TypingManager.hasTyping 当前 channel)→ "··· 正在输入"
 *   - 否则有草稿(chatDraftStore.map.get(channelKey))→ "[草稿] {text}"
 *     ([草稿] 红色 + 文本灰色,对齐旧 wk-reminder.draft + lastmsg 排版)
 *   - 否则 → 渲染 fallback(传入的原始 digest 文本)
 *
 * 优先级 typing > draft > fallback — 对齐旧 ConversationList:
 *   line 660 `!typing ? <label className="wk-reminder">[草稿]</label> : undefined`
 *
 * UI 对齐截图 #37:typing 用 3 个紫灰跳动点 + "正在输入" 灰字。
 */
export function ConversationTypingDigest({ channel, fallback }: ConversationTypingDigestProps) {
  const typing = useTypingForChannel(channel);
  const draft = useStore(chatDraftStore, selectDraftForChannel(channel));

  if (typing) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <style>{TYPING_DIGEST_KEYFRAMES}</style>
        <span className="inline-flex items-center gap-[3px]">
          <span className="wk-typing-digest-dot" />
          <span className="wk-typing-digest-dot" />
          <span className="wk-typing-digest-dot" />
        </span>
        <span>正在输入</span>
      </span>
    );
  }

  if (draft && draft.trim() !== "") {
    return (
      <span className="inline-flex min-w-0 items-center gap-1">
        <span className="shrink-0 text-xs font-medium text-error">[草稿]</span>
        <span className="min-w-0 truncate">{draft}</span>
      </span>
    );
  }

  return <>{fallback}</>;
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
