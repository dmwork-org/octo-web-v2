import type { Reply } from "wukongimjssdk";

interface ReplyBlockProps {
  reply: Reply;
  /** 点击跳转到原消息(P3+ 接入,本期 noop)。 */
  onClick?: () => void;
}

/**
 * 引用消息块(对应旧 dmworkbase/ui/message/ReplyBlock,1:1 CSS):
 *
 *   ┃ 许建文          ← 12px / 18px / rgba(28,28,35,0.60)
 *   ┃ 123456765432    ← 同
 *
 * - 容器:flex items-stretch gap-2,padding 6px 8px,bg rgba(28,28,35,0.04),
 *   rounded 6px,fit-content(max-w 100%)
 * - 左 2px 竖条:rgba(28,28,35,0.40),min-h 18px,rounded 1px
 * - 两行 12px / leading-18px / 同色 / truncate
 */
export function ReplyBlock({ reply, onClick }: ReplyBlockProps) {
  const fromName = reply.fromName || reply.fromUID || "";
  const digest =
    (reply.content as { conversationDigest?: string } | undefined)?.conversationDigest ?? "";
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full cursor-pointer items-stretch gap-2 overflow-hidden rounded-md bg-[rgba(28,28,35,0.04)] px-2 py-1.5 text-left transition-opacity hover:opacity-80"
    >
      <span className="w-0.5 shrink-0 self-stretch rounded-[1px] bg-[rgba(28,28,35,0.40)] [min-height:18px]" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[12px] leading-[18px] text-[rgba(28,28,35,0.60)]">
          {fromName}
        </span>
        <span className="truncate text-[12px] leading-[18px] text-[rgba(28,28,35,0.60)]">
          {digest}
        </span>
      </span>
    </button>
  );
}
