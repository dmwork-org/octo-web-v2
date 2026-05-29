import type { Reply } from "wukongimjssdk";

interface ReplyBlockProps {
  reply: Reply;
  /** 点击跳转到原消息(P3+ 接入,本期 noop)。 */
  onClick?: () => void;
}

/**
 * 引用消息块(对应旧 dmworkbase/ui/message/ReplyBlock 截图视觉):
 *
 *   ┌──────────────────────────────────────────┐
 *   │ 许建文                                     │
 *   │ 123456765432                               │
 *   └──────────────────────────────────────────┘
 *
 * full-width 浅灰底块(`bg-bg-elevated`),padding 舒展(px-4 py-2.5),
 * 两行:fromName + digest 同色同字号,圆角 6px。点击跳转原消息 P3+ 接入。
 */
export function ReplyBlock({ reply, onClick }: ReplyBlockProps) {
  const fromName = reply.fromName || reply.fromUID || "";
  const digest =
    (reply.content as { conversationDigest?: string } | undefined)?.conversationDigest ?? "";
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full rounded-md bg-bg-elevated px-4 py-2.5 text-left transition-colors hover:bg-bg-hover"
    >
      <div className="truncate text-[13px] leading-relaxed text-text-secondary">{fromName}</div>
      <div className="truncate text-[13px] leading-relaxed text-text-secondary">{digest}</div>
    </button>
  );
}
