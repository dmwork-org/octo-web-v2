import { type Message, type SystemContent } from "wukongimjssdk";

interface SystemRendererProps {
  message: Message;
}

/**
 * 系统消息(contentType 1000-2000):入群/退群/撤回/管理员变更等。
 * 旧项目 packages/dmworkbase/src/Messages/System 同样渲染 displayText。
 *
 * SystemContent.displayText 是 SDK getter,从 payload 自动派生展示文本;
 * 未识别的 system content 走 fallback("[系统消息]")。
 */
export function SystemRenderer({ message }: SystemRendererProps) {
  const content = message.content as SystemContent;
  const text =
    content?.displayText && content.displayText !== "" ? content.displayText : "[系统消息]";
  return (
    <div className="flex justify-center py-1">
      <span className="rounded-md bg-bg-elevated px-3 py-1 text-[11px] leading-none text-text-tertiary">
        {text}
      </span>
    </div>
  );
}
