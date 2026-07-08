import type { StickerItem } from "@/features/base/api/endpoints/sticker.api";

const STICKERS_UPDATED_EVENT = "chat:stickers-updated";

export interface StickersUpdatedDetail {
  sticker?: StickerItem;
}

export function notifyStickersUpdated(sticker?: StickerItem): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<StickersUpdatedDetail>(STICKERS_UPDATED_EVENT, {
      detail: { sticker },
    }),
  );
}

export function subscribeStickersUpdated(
  listener: (detail: StickersUpdatedDetail) => void,
): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handler = (event: Event) => {
    listener((event as CustomEvent<StickersUpdatedDetail>).detail ?? {});
  };
  window.addEventListener(STICKERS_UPDATED_EVENT, handler);
  return () => window.removeEventListener(STICKERS_UPDATED_EVENT, handler);
}
