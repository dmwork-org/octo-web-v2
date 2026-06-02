import { type Message, type SystemContent } from "wukongimjssdk";

interface SystemRendererProps {
  message: Message;
}

/**
 * 系统消息(contentType 1000-2000):入群/退群/撤回/管理员变更等。
 *
 * 视觉对齐旧 Messages/System/index.css(与 TimeDivider 同款胶囊):
 *   - 11px / leading 1.5 / color text-tertiary
 *   - bg rgba(0,0,0,0.03) / radius-full / padding 2px 10px
 *
 * **font-weight**:旧源码 `var(--wk-font-medium, 500)`,但旧字体是 Roboto;
 * 新仓中文字体 PingFang SC 下 medium 视觉过粗,跟旧仓视觉不一致 — 用 default 400。
 */
export function SystemRenderer({ message }: SystemRendererProps) {
  const content = message.content as SystemContent;
  const text =
    content?.displayText && content.displayText !== "" ? content.displayText : "[系统消息]";
  return (
    <div className="flex justify-center">
      <span className="rounded-full bg-[rgba(0,0,0,0.03)] px-2.5 py-0.5 text-[11px] leading-[1.5] text-text-tertiary">
        {text}
      </span>
    </div>
  );
}
