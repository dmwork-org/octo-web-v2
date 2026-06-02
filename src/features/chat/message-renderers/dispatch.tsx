import { type Message, MessageContentType } from "wukongimjssdk";
import { MessageContentTypeConst } from "@/features/base/im/content-types";
import { TextRenderer } from "@/features/chat/message-renderers/text-renderer";
import { SystemRenderer } from "@/features/chat/message-renderers/system-renderer";
import { ImageRenderer } from "@/features/chat/message-renderers/image-renderer";
import { FileRenderer } from "@/features/chat/message-renderers/file-renderer";
import { VoiceRenderer } from "@/features/chat/message-renderers/voice-renderer";
import { GifRenderer } from "@/features/chat/message-renderers/gif-renderer";
import { VideoRenderer } from "@/features/chat/message-renderers/video-renderer";
import { MergeforwardRenderer } from "@/features/chat/message-renderers/mergeforward-renderer";
import { ThreadCreatedRenderer } from "@/features/chat/message-renderers/thread-created-renderer";
import { RevokedRenderer } from "@/features/chat/message-renderers/revoked-renderer";
import { CardRenderer } from "@/features/chat/message-renderers/card-renderer";
import { LocationRenderer } from "@/features/chat/message-renderers/location-renderer";
import { ScreenshotRenderer } from "@/features/chat/message-renderers/screenshot-renderer";
import { JoinOrganizationRenderer } from "@/features/chat/message-renderers/join-organization-renderer";
import { TypingRenderer } from "@/features/chat/message-renderers/typing-renderer";

/**
 * 按 contentType 分发到具体 renderer。
 *
 * 优先级:
 * 1. remoteExtra.revoke → RevokedRenderer("xxx 撤回了一条消息",P2-B8)
 * 2. 精确 contentType(text/image/file/voice/gif/video/mergeForward/threadCreated/typing/...)
 * 3. 1000 ≤ contentType ≤ 2000 → SystemRenderer(displayText 兜底)
 * 4. 兜底 [不支持的消息类型 X]
 *
 * threadCreated(1100)在 system 范围内但有富 payload + 点击进子区,精确匹配
 * 优先于 system fallback。
 * typing(-2)是 transient 状态消息,3 个跳动点占位。
 */
export function MessageDispatch({ message }: { message: Message }) {
  if (message.remoteExtra?.revoke) {
    return <RevokedRenderer message={message} />;
  }
  const ct = message.contentType;
  switch (ct) {
    case MessageContentTypeConst.typing:
      return <TypingRenderer />;
    case MessageContentType.text:
      return <TextRenderer message={message} />;
    case MessageContentType.image:
      return <ImageRenderer message={message} />;
    case MessageContentTypeConst.file:
      return <FileRenderer message={message} />;
    case MessageContentTypeConst.voice:
      return <VoiceRenderer message={message} />;
    case MessageContentTypeConst.gif:
      return <GifRenderer message={message} />;
    case MessageContentTypeConst.smallVideo:
      return <VideoRenderer message={message} />;
    case MessageContentTypeConst.mergeForward:
      return <MergeforwardRenderer message={message} />;
    case MessageContentTypeConst.card:
      return <CardRenderer message={message} />;
    case MessageContentTypeConst.location:
      return <LocationRenderer message={message} />;
    case MessageContentTypeConst.screenshot:
      return <ScreenshotRenderer message={message} />;
    case MessageContentTypeConst.joinOrganization:
      return <JoinOrganizationRenderer message={message} />;
    case MessageContentTypeConst.threadCreated:
      return <ThreadCreatedRenderer message={message} />;
  }
  if (ct >= 1000 && ct <= 2000) {
    return <SystemRenderer message={message} />;
  }
  return (
    <div className="flex justify-center">
      <span className="rounded bg-bg-elevated px-2 py-1 text-[11px] text-text-tertiary">
        [不支持的消息类型 {ct}]
      </span>
    </div>
  );
}
