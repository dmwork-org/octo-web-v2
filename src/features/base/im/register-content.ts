import WKSDK from "wukongimjssdk";
import { MessageContentTypeConst } from "@/features/base/im/content-types";
import { FileContent } from "@/features/base/im/file-content";

/**
 * 注册自定义 MessageContent 子类(SDK 默认只内置 text/image/signalMessage)。
 *
 * 对应旧项目 packages/dmworkbase/src/module.tsx::init() 中的 WKSDK.shared().register(...)
 * 长 List。这里按 P 阶段渐进式注册:
 *   - P2-B5: file
 *   - P3-C4: gif / voice / video(VoiceContent / VideoContent / GifContent)
 *   - P4-E*: card / lottieSticker / location / mergeForward / screenshot / summaryCard / ...
 *
 * 幂等:SDK register 直接覆盖 contentMap[contentType]。
 */
export function registerContentTypes(): void {
  WKSDK.shared().register(MessageContentTypeConst.file, () => new FileContent());
}
