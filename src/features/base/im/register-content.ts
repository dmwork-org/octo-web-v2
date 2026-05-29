import WKSDK from "wukongimjssdk";
import { MessageContentTypeConst } from "@/features/base/im/content-types";
import { FileContent } from "@/features/base/im/file-content";
import { GifContent } from "@/features/base/im/gif-content";
import { MergeforwardContent } from "@/features/base/im/mergeforward-content";
import { ThreadCreatedContent } from "@/features/base/im/thread-created-content";
import { VideoContent } from "@/features/base/im/video-content";
import { VoiceContent } from "@/features/base/im/voice-content";
import { CardContent } from "@/features/base/im/card-content";
import { LocationContent } from "@/features/base/im/location-content";
import { ScreenshotContent } from "@/features/base/im/screenshot-content";
import { JoinOrganizationContent } from "@/features/base/im/join-organization-content";

/**
 * 注册自定义 MessageContent 子类(SDK 默认只内置 text/image/signalMessage)。
 *
 * 对应旧项目 packages/dmworkbase/src/module.tsx::init() 中的 WKSDK.shared().register(...)
 * 长 List。这里按 P 阶段渐进式注册:
 *   - P2-B5: file
 *   - P2-B*: voice / gif / smallVideo / mergeForward / threadCreated
 *   - P3+: card / lottieSticker / location / screenshot / summaryCard / ...
 *
 * 幂等:SDK register 直接覆盖 contentMap[contentType]。
 */
export function registerContentTypes(): void {
  WKSDK.shared().register(MessageContentTypeConst.file, () => new FileContent());
  WKSDK.shared().register(MessageContentTypeConst.voice, () => new VoiceContent());
  WKSDK.shared().register(MessageContentTypeConst.gif, () => new GifContent());
  WKSDK.shared().register(MessageContentTypeConst.smallVideo, () => new VideoContent());
  WKSDK.shared().register(MessageContentTypeConst.mergeForward, () => new MergeforwardContent());
  WKSDK.shared().register(MessageContentTypeConst.threadCreated, () => new ThreadCreatedContent());
  WKSDK.shared().register(MessageContentTypeConst.card, () => new CardContent());
  WKSDK.shared().register(MessageContentTypeConst.location, () => new LocationContent());
  WKSDK.shared().register(MessageContentTypeConst.screenshot, () => new ScreenshotContent());
  WKSDK.shared().register(
    MessageContentTypeConst.joinOrganization,
    () => new JoinOrganizationContent(),
  );
}
