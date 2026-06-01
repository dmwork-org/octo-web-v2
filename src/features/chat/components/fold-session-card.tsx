import WKSDK, { Channel, ChannelTypePerson, type Message } from "wukongimjssdk";
import { Sparkles } from "lucide-react";
import { MessageRow } from "@/features/chat/components/message-row";
import { type FoldSession } from "@/features/chat/lib/fold-session";

interface FoldSessionCardProps {
  session: FoldSession;
  expanded: boolean;
  onToggle: () => void;
}

/**
 * AI 多 bot 协作折叠会话卡(对齐旧 dmworkbase Conversation + FoldSessionCard):
 *
 * 截图 25 视觉:
 *   ┌ [AI 圆 32] 调度 × 开发  [AI协作 紫胶囊]  16:50          展开 N 条讨论 ┐
 *   │  ┌────────────────────────────────────────────────────┐               │
 *   │  │ [开发 灰胶囊] 16:50                                  │               │
 *   │  │ 收到!我是开发虾...(markdown 内容)                    │               │
 *   │  └────────────────────────────────────────────────────┘               │
 *   └─────────────────────────────────────────────────────────────────────┘
 *
 * 结构(对齐旧 .wk-message-item-fold-session-shell + content):
 *   - shell: px-4 + gap-2 + items-start
 *   - avatar: 32×32 AI 紫渐变圆 + ✨ icon
 *   - content:
 *     - title row: 参与者名(× 分隔)+ "AI协作" 紫胶囊 + 时间 + 右侧 toggle btn
 *     - 卡片 bg rgba(28,28,35,0.04) / r 8 / p 12 / max-w min(680, vw-120)
 *       折叠:渲染 lastMessage(简版 sender 灰标 + body)
 *       展开:渲染所有 messages(MessageRow 普通流)
 *
 * 简化:
 *   - 单/多 AI 都用 "AI协作" 标签(旧:1 个 AI 时是 "AI助手",多 AI 时 "AI协作")
 *   - 不做 > 5 个 AI tooltip 折叠
 *   - 不做 shouldMergeFlash / appearing 动效
 */
export function FoldSessionCard({ session, expanded, onToggle }: FoldSessionCardProps) {
  const { participants, messages, lastMessage, isActive } = session;
  const participantLabel = participants.map((p) => p.name).join(" × ") || "AI";
  const time = formatTime(lastMessage.timestamp);

  return (
    <div className="mt-6 flex items-start gap-2 px-4">
      {/* AI 圆形头像 */}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#7b89f4] to-[#9d78f5] text-white">
        <Sparkles size={16} fill="currentColor" />
      </div>

      {/* 右侧内容 */}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {/* 标题行 */}
        <header className="flex max-w-[min(680px,calc(100vw_-_120px))] flex-wrap items-center gap-2">
          <span className="truncate text-[14px] font-semibold text-[#000]">{participantLabel}</span>
          <span className="inline-flex h-[18px] shrink-0 items-center rounded-[4px] bg-gradient-to-r from-[#7b89f4] to-[#9d78f5] px-1.5 text-[11px] leading-none font-medium text-white">
            AI协作
          </span>
          <span className="text-[14px] text-[rgba(28,28,35,0.4)]">{time}</span>
          <button
            type="button"
            onClick={onToggle}
            className="ml-auto cursor-pointer text-[12px] font-semibold whitespace-nowrap text-[#7f3bf5] transition-opacity hover:opacity-80"
          >
            {expanded ? "收起" : `展开 ${messages.length} 条讨论`}
          </button>
        </header>

        {/* 卡片体 */}
        <div className="w-full max-w-[min(680px,calc(100vw_-_120px))] overflow-hidden rounded-lg bg-[rgba(28,28,35,0.04)] p-3">
          {expanded ? (
            <FoldSessionExpanded messages={messages} />
          ) : (
            <FoldSessionSummary message={lastMessage} isActive={isActive} />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * 折叠态摘要:渲染 lastMessage 简版 — [sender 灰胶囊] [HH:mm] + body(走 MessageRow bare)。
 */
function FoldSessionSummary({ message, isActive }: { message: Message; isActive: boolean }) {
  const senderName = senderTitleOf(message.fromUID);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-5 shrink-0 items-center rounded bg-[rgba(0,0,0,0.05)] px-1.5 text-[11px] leading-none text-[rgba(28,28,35,0.6)]">
          {senderName}
        </span>
        <span className="text-[11px] text-[rgba(28,28,35,0.4)]">
          {formatTime(message.timestamp)}
        </span>
        {isActive ? <span className="text-[11px] text-[#7f3bf5]">协作中…</span> : null}
      </div>
      <div className="-mx-3 -mb-3">
        <MessageRow message={message} bare />
      </div>
    </div>
  );
}

/**
 * 展开态:渲染所有 messages(MessageRow 普通流,各自 sender header + body)。
 */
function FoldSessionExpanded({ messages }: { messages: Message[] }) {
  return (
    <div className="-mx-3 -my-3 flex flex-col">
      {messages.map((m, i) => (
        <MessageRow
          key={m.clientMsgNo || m.messageID}
          message={m}
          continueWithPrev={i > 0 && messages[i - 1].fromUID === m.fromUID}
        />
      ))}
    </div>
  );
}

/** HH:mm 格式化(对齐旧 timeOnly)。 */
function formatTime(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** uid → Person channelInfo title fallback uid。 */
function senderTitleOf(fromUID: string): string {
  if (!fromUID) return "";
  const info = WKSDK.shared().channelManager.getChannelInfo(
    new Channel(fromUID, ChannelTypePerson),
  );
  return info?.title || fromUID;
}
