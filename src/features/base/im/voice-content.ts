import { MediaMessageContent } from "wukongimjssdk";
import { t } from "@/lib/i18n/instance";
import { MessageContentTypeConst } from "@/features/base/im/content-types";

/**
 * 语音消息 content(对应旧项目 dmworkbase/Messages/Voice VoiceContent):
 *
 *   - `url`:语音文件远端 URL(后端发回);本地新建时 file 还在,url 会在
 *     MediaMessageUploadTask 上传后回写
 *   - `timeTrad`:时长(秒)
 *   - `waveform`:波形 base64 / 字符串(可选,旧版很多场景为空)
 *
 * SDK 标准 contentType voice = 4(对齐 MessageContentTypeConst.voice)。
 *
 * 不要混淆 wukongimjssdk 自带 MessageContentType.text(=1)、image(=2)— 它没暴露
 * voice / file / video,我们走 const + register 自定义 ContentMap。
 */
export class VoiceContent extends MediaMessageContent {
  url = "";
  timeTrad = 0;
  waveform = "";

  constructor(file?: File, timeTrad?: number) {
    super();
    if (file) this.file = file;
    if (typeof timeTrad === "number") this.timeTrad = timeTrad;
  }

  decodeJSON(content: Record<string, unknown>): void {
    this.url = typeof content.url === "string" ? content.url : "";
    this.timeTrad = typeof content.timeTrad === "number" ? content.timeTrad : 0;
    this.waveform = typeof content.waveform === "string" ? content.waveform : "";
    this.remoteUrl = this.url;
  }

  encodeJSON(): Record<string, unknown> {
    return {
      url: this.remoteUrl,
      timeTrad: this.timeTrad,
      waveform: this.waveform,
    };
  }

  get contentType(): number {
    return MessageContentTypeConst.voice;
  }

  get conversationDigest(): string {
    return t("message.digest.voice");
  }
}
