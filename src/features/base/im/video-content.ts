import { MediaMessageContent } from "wukongimjssdk";
import { t } from "@/lib/i18n/instance";
import { MessageContentTypeConst } from "@/features/base/im/content-types";

/**
 * 小视频消息(对应旧 dmworkbase Messages/Video VideoContent)。
 *
 * 字段:
 *   - url:小视频下载地址
 *   - cover:封面图(后端在上传时同步生成 + 返回)
 *   - size:文件大小(byte)
 *   - width / height:视频尺寸
 *   - second:时长(秒)
 *
 * 继承 MediaMessageContent:发送时 file 在,MediaMessageUploadTask 上传后回写
 * url + remoteUrl;转发场景仅 url 有,无 file。
 */
export class VideoContent extends MediaMessageContent {
  url = "";
  cover = "";
  size = 0;
  width = 0;
  height = 0;
  second = 0;

  decodeJSON(content: Record<string, unknown>): void {
    this.url = typeof content.url === "string" ? content.url : "";
    this.cover = typeof content.cover === "string" ? content.cover : "";
    this.size = typeof content.size === "number" ? content.size : 0;
    this.width = typeof content.width === "number" ? content.width : 0;
    this.height = typeof content.height === "number" ? content.height : 0;
    this.second = typeof content.second === "number" ? content.second : 0;
    this.remoteUrl = this.url;
  }

  encodeJSON(): Record<string, unknown> {
    return {
      url: this.remoteUrl || this.url,
      cover: this.cover,
      size: this.size,
      width: this.width,
      height: this.height,
      second: this.second,
    };
  }

  get contentType(): number {
    return MessageContentTypeConst.smallVideo;
  }

  get conversationDigest(): string {
    return t("video.digest");
  }
}
