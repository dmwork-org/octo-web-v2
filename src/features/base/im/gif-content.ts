import { MessageContent } from "wukongimjssdk";
import { t } from "@/lib/i18n/instance";
import { MessageContentTypeConst } from "@/features/base/im/content-types";

/**
 * GIF 动图消息(对应旧 dmworkbase Messages/Gif GifContent)。
 *
 * 字段:url(downloadUrl)/ width / height(原图尺寸)。
 *
 * 防御:线上观测 content 偶发被 double-stringify(中转脚本多 JSON.stringify 一次),
 * decode 后是字符串而不是对象 → 这里手动 JSON.parse 一次兜底。
 */
export class GifContent extends MessageContent {
  url = "";
  width = 0;
  height = 0;

  decodeJSON(raw: Record<string, unknown> | string): void {
    const content = parseRaw(raw);
    this.url = typeof content.url === "string" ? content.url : "";
    this.width = typeof content.width === "number" ? content.width : 0;
    this.height = typeof content.height === "number" ? content.height : 0;
  }

  encodeJSON(): Record<string, unknown> {
    return { url: this.url, width: this.width, height: this.height };
  }

  get contentType(): number {
    return MessageContentTypeConst.gif;
  }

  get conversationDigest(): string {
    return t("message.digest.gif");
  }
}

function parseRaw(raw: Record<string, unknown> | string): Record<string, unknown> {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}
