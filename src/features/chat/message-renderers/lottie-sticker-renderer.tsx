import type { Message } from "wukongimjssdk";
import {
  isBitmapStickerFormat,
  type LottieStickerContent,
} from "@/features/base/im/lottie-sticker-content";
import { useT } from "@/lib/i18n/use-t";

export function LottieStickerRenderer({ message }: { message: Message }) {
  const t = useT();
  const content = message.content as LottieStickerContent;
  const src = content.url || content.placeholder;

  if (!src) {
    return (
      <span className="text-[13px] text-text-tertiary">{t("sticker.messageUnavailable")}</span>
    );
  }

  if (isBitmapStickerFormat(content.format) || !content.format) {
    return (
      <img
        src={src}
        alt={t("sticker.messageAlt")}
        className="max-h-[160px] max-w-[160px] object-contain"
        draggable={false}
      />
    );
  }

  return (
    <span className="inline-flex max-w-[220px] rounded-md bg-bg-elevated px-2 py-1 text-[13px] text-text-secondary">
      {t("sticker.unsupportedFormat", { values: { format: content.format } })}
    </span>
  );
}
