import { MediaMessageContent } from "wukongimjssdk";
import { t } from "@/lib/i18n/instance";
import { MessageContentTypeConst } from "@/features/base/im/content-types";

/**
 * 文件消息 content(对应旧项目 packages/dmworkbase/src/Messages/File/FileContent.ts)。
 *
 * SDK 内置 MessageContentType 只覆盖 text/image/signal,file/voice/video/card 等
 * 业务 content 需自己定义 + 注册到 contentManager。register-content.ts 集中注册。
 */
export class FileContent extends MediaMessageContent {
  name = "";
  ext = "";
  extension = "";
  size = 0;
  url = "";
  caption?: string;
  mentionUids?: string[];

  constructor(
    file?: File,
    name?: string,
    ext?: string,
    size?: number,
    caption?: string,
    mentionUids?: string[],
  ) {
    super();
    this.file = file;
    this.name = name ?? file?.name ?? "";
    this.setExtension(ext ?? "");
    this.size = size ?? file?.size ?? 0;
    this.caption = caption;
    this.mentionUids = mentionUids;
  }

  decodeJSON(content: Record<string, unknown>): void {
    this.name = typeof content.name === "string" ? content.name : "";
    this.setExtension(typeof content.extension === "string" ? content.extension : "");
    this.size = typeof content.size === "number" ? content.size : 0;
    this.url = typeof content.url === "string" ? content.url : "";
    this.caption = typeof content.caption === "string" ? content.caption : "";
    this.mentionUids = Array.isArray(content.mention_uids)
      ? (content.mention_uids as string[])
      : [];
    this.remoteUrl = this.url;
  }

  encodeJSON(): Record<string, unknown> {
    const extension = this.extension || this.ext;
    const json: Record<string, unknown> = {
      name: this.name,
      extension,
      size: this.size,
      url: this.remoteUrl,
    };
    if (this.caption) json.caption = this.caption;
    if (this.mentionUids && this.mentionUids.length > 0) json.mention_uids = this.mentionUids;
    return json;
  }

  get contentType(): number {
    return MessageContentTypeConst.file;
  }

  get conversationDigest(): string {
    return t("message.digest.file");
  }

  private setExtension(ext: string): void {
    this.ext = ext;
    this.extension = ext;
  }
}
