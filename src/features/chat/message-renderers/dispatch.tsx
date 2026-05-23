import { type Message, MessageContentType } from "wukongimjssdk";
import { TextRenderer } from "@/features/chat/message-renderers/text-renderer";
import { SystemRenderer } from "@/features/chat/message-renderers/system-renderer";

/**
 * 按 contentType 分发到具体 renderer。
 *
 * 命中规则:
 * - 精确 contentType(text/image/file/...)
 * - 1000 ≤ contentType ≤ 2000 走 SystemRenderer(对应旧项目 module.tsx 388-391)
 * - 兜底 UnsupportedRenderer 占位,避免渲染崩
 */
export function MessageDispatch({ message }: { message: Message }) {
  const ct = message.contentType;
  if (ct >= 1000 && ct <= 2000) {
    return <SystemRenderer message={message} />;
  }
  switch (ct) {
    case MessageContentType.text:
      return <TextRenderer message={message} />;
    default:
      return (
        <div className="flex justify-center">
          <span className="rounded bg-bg-elevated px-2 py-1 text-[11px] text-text-tertiary">
            [不支持的消息类型 {ct}]
          </span>
        </div>
      );
  }
}
