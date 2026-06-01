import { type Message, type SystemContent } from "wukongimjssdk";

interface SystemRendererProps {
  message: Message;
}

/**
 * 系统消息(contentType 1000-2000):入群/退群/撤回/管理员变更等。
 *
 * 视觉 1:1 对齐旧 Messages/System/index.css(与 TimeDivider 同款胶囊):
 *   - 11px / weight 500 / leading 1.5 / color text-tertiary
 *   - bg rgba(0,0,0,0.03) / radius-full / padding 2px 10px
 *
 * SystemContent.displayText 是 SDK getter,从 payload 自动派生展示文本;
 * 未识别的 system content 走 fallback("[系统消息]")。
 *
 * 外层居中由 message-row bare 分支负责(px-4 py-2 = sp-2/sp-4)。
 */
export function SystemRenderer({ message }: SystemRendererProps) {
  const content = message.content as SystemContent;
  const text =
    content?.displayText && content.displayText !== "" ? content.displayText : "[系统消息]";
  return (
    <div className="flex justify-center">
      <span className="rounded-full bg-[rgba(0,0,0,0.03)] px-2.5 py-0.5 text-[11px] leading-[1.5] font-medium text-text-tertiary">
        {text}
      </span>
    </div>
  );
}
