import type { Channel } from "wukongimjssdk";
import { useTypingForChannel } from "@/features/chat/hooks/use-typing-for-channel.hook";

interface ConversationTypingDigestProps {
  /** 会话 channel — 取此 channel 的 typing 状态 */
  channel: Channel;
  /** typing 不活跃时回退渲染(通常是 lastMessage digest 文本)。 */
  fallback: React.ReactNode;
}

/**
 * 会话列表行的 "lastMessage 摘要 ↔ 正在输入" 切换器:
 *   - typing 中(TypingManager.hasTyping 当前 channel)→ "··· 正在输入"
 *   - 否则 → 渲染 fallback(传入的原始 digest 文本)
 *
 * UI 对齐截图 #37:3 个紫灰跳动点 + "正在输入" 灰字。
 * 跳动点用 inline keyframes(避免污染全局 CSS),frequency 跟主聊天区
 * TypingRenderer 不同 — 这里更小更快(sidebar 列表 dense 排列)。
 */
export function ConversationTypingDigest({ channel, fallback }: ConversationTypingDigestProps) {
  const typing = useTypingForChannel(channel);
  if (!typing) return <>{fallback}</>;
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
