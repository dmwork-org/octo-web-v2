import { MessageContent } from "wukongimjssdk";
import { t } from "@/lib/i18n/instance";
import { MessageContentTypeConst } from "@/features/base/im/content-types";

export class LottieStickerContent extends MessageContent {
  category = "";
  url = "";
  placeholder = "";
  format = "";

  decodeJSON(raw: Record<string, unknown> | string): void {
    const content = parseRaw(raw);
    this.category = typeof content.category === "string" ? content.category : "";
    this.url = typeof content.url === "string" ? content.url : "";
    this.placeholder = typeof content.placeholder === "string" ? content.placeholder : "";
    this.format = typeof content.format === "string" ? content.format : "";
  }

  encodeJSON(): Record<string, unknown> {
    return {
      category: this.category,
      url: this.url,
      placeholder: this.placeholder,
      format: this.format,
    };
  }

  get contentType(): number {
    return MessageContentTypeConst.lottieSticker;
  }

  get conversationDigest(): string {
    return t("message.digest.sticker");
  }
}

export function isBitmapStickerFormat(format?: string): boolean {
  const f = (format ?? "").trim().toLowerCase();
  return f === "png" || f === "jpg" || f === "jpeg" || f === "webp" || f === "gif";
}

function parseRaw(raw: Record<string, unknown> | string): Record<string, unknown> {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}
