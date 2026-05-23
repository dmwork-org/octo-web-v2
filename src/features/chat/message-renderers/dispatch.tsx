import { type Message, MessageContentType } from "wukongimjssdk";
import { MessageContentTypeConst } from "@/features/base/im/content-types";
import { TextRenderer } from "@/features/chat/message-renderers/text-renderer";
import { SystemRenderer } from "@/features/chat/message-renderers/system-renderer";
import { ImageRenderer } from "@/features/chat/message-renderers/image-renderer";
import { FileRenderer } from "@/features/chat/message-renderers/file-renderer";
import { RevokedRenderer } from "@/features/chat/message-renderers/revoked-renderer";

/**
 * 按 contentType 分发到具体 renderer。
 *
 * 优先级:
 * 1. remoteExtra.revoke → RevokedRenderer("xxx 撤回了一条消息",P2-B8)
 * 2. 1000 ≤ contentType ≤ 2000 → SystemRenderer(旧项目 module.tsx 388-391)
 * 3. 精确 contentType(text/image/file/...)
 * 4. 兜底 [不支持的消息类型 X]
 */
export function MessageDispatch({ message }: { message: Message }) {
  if (message.remoteExtra?.revoke) {
    return <RevokedRenderer message={message} />;
  }
  const ct = message.contentType;
  if (ct >= 1000 && ct <= 2000) {
    return <SystemRenderer message={message} />;
  }
  switch (ct) {
    case MessageContentType.text:
      return <TextRenderer message={message} />;
    case MessageContentType.image:
      return <ImageRenderer message={message} />;
    case MessageContentTypeConst.file:
      return <FileRenderer message={message} />;
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
