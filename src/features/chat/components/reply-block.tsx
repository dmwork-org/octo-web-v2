import type { Reply } from "wukongimjssdk";

interface ReplyBlockProps {
  reply: Reply;
  /** 点击跳转到原消息(P3+ 接入,本期 noop)。 */
  onClick?: () => void;
}

/**
 * 引用消息块(对应旧 dmworkbase/ui/message/ReplyBlock,Figma 387:62976):
 *
 *   ┌─ 2px 竖条
 *   │ Alice                    ← 12px,text-secondary
 *   │ 嗨,这是被引用的消息内容  ← 12px,text-secondary,单行截断
 *   └────
 *
 * 灰底圆角 6px 卡片,挂在 message-row 内容前。点击跳转原消息 P3+ 接入
 * (需要 message-list 滚动 + 临时高亮,跟群内搜索定位同一机制)。
 */
export function ReplyBlock({ reply, onClick }: ReplyBlockProps) {
  const fromName = reply.fromName || reply.fromUID || "";
  // conversationDigest 是后端 / SDK 把被引用消息内容压成 "[图片]" / "嗨..." 等纯文本摘要
  // 字段透传在 reply.content 里(可能是 MessageContent 实例或 plain JSON)
  const digest =
    (reply.content as { conversationDigest?: string } | undefined)?.conversationDigest ?? "";
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex max-w-full items-stretch gap-2 rounded-md bg-bg-elevated px-2 py-1.5 text-left transition-colors hover:bg-bg-hover"
    >
      <span className="w-0.5 shrink-0 self-stretch rounded-sm bg-text-tertiary/60" />
      <div className="flex min-w-0 flex-col gap-0.5 text-[12px] leading-[1.4]">
        <span className="truncate text-text-secondary">{fromName}</span>
        <span className="truncate text-text-secondary">{digest}</span>
      </div>
    </button>
  );
}
