import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { ImagePlus, Loader2, Smile, X } from "lucide-react";
import {
  getAllEmojiItems,
  subscribeEmojiManifest,
  type EmojiPickerItem,
} from "@/features/base/emoji/emoji-data";
import {
  addUserSticker,
  deleteUserSticker,
  listUserStickers,
  uploadStickerFile,
  type StickerItem,
} from "@/features/base/api/endpoints/sticker.api";
import { useStickerCustomEnabled } from "@/features/base/queries/appconfig.query";
import {
  notifyStickersUpdated,
  subscribeStickersUpdated,
  type StickersUpdatedDetail,
} from "@/features/chat/lib/sticker-events";
import { message } from "@/components/ui/message";
import { useT } from "@/lib/i18n/use-t";

interface EmojiPickerPopoverProps {
  open: boolean;
  /** 含按钮 + 面板的 wrapper ref(用于点外面关) */
  containerRef: React.RefObject<HTMLElement | null>;
  /** 用户选中 emoji 后回调 token(unicode 字符 或 自家 [xxx] token,直接插 editor) */
  onSelect: (token: string) => void;
  onStickerSelect: (sticker: StickerItem) => void;
  onClose: () => void;
}

/** mousedown 落容器外 → 关闭。抽出命名 hook 满足 no-useeffect-in-component。 */
function useClickOutside(
  ref: React.RefObject<HTMLElement | null>,
  onOutside: () => void,
  enabled: boolean,
) {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onOutside();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [enabled, onOutside, ref]);
}

function useEmojiItems(): EmojiPickerItem[] {
  const [items, setItems] = useState(() => getAllEmojiItems());
  useEffect(() => subscribeEmojiManifest(() => setItems(getAllEmojiItems())), []);
  return items;
}

function useResetPopoverOnClose(open: boolean, setTab: (value: "emoji" | "sticker") => void) {
  useEffect(() => {
    if (!open) {
      setTab("emoji");
    }
  }, [open, setTab]);
}

function useLoadStickersOnTabOpen(args: {
  open: boolean;
  tab: "emoji" | "sticker";
  stickersLoaded: boolean;
  stickerLoading: boolean;
  setStickerLoading: (value: boolean) => void;
  setStickersLoaded: (value: boolean) => void;
  setStickers: (value: StickerItem[]) => void;
}) {
  const {
    open,
    tab,
    stickersLoaded,
    stickerLoading,
    setStickerLoading,
    setStickersLoaded,
    setStickers,
  } = args;
  useEffect(() => {
    if (!open || tab !== "sticker" || stickersLoaded || stickerLoading) return;
    setStickerLoading(true);
    void listUserStickers({ silent: true })
      .then((list) => {
        setStickers(list);
        setStickersLoaded(true);
      })
      .finally(() => setStickerLoading(false));
  }, [
    open,
    setStickerLoading,
    setStickers,
    setStickersLoaded,
    stickerLoading,
    stickersLoaded,
    tab,
  ]);
}

function sameSticker(a: StickerItem, b: StickerItem): boolean {
  if (a.path && b.path && a.path === b.path) return true;
  const aId = a.sticker_id || a.id;
  const bId = b.sticker_id || b.id;
  if (aId && bId) return aId === bId;
  return false;
}

function useRefreshLoadedStickersOnEvent(args: {
  stickersLoaded: boolean;
  stickerLoading: boolean;
  setStickerLoading: (value: boolean) => void;
  setStickers: Dispatch<SetStateAction<StickerItem[]>>;
}) {
  const { stickersLoaded, stickerLoading, setStickerLoading, setStickers } = args;
  useEffect(() => {
    return subscribeStickersUpdated((detail: StickersUpdatedDetail) => {
      if (!stickersLoaded || stickerLoading) return;
      if (detail.sticker) {
        setStickers((prev) =>
          prev.some((item) => sameSticker(item, detail.sticker!))
            ? prev
            : [detail.sticker!, ...prev],
        );
        return;
      }
      setStickerLoading(true);
      void listUserStickers({ silent: true })
        .then((list) => setStickers(list))
        .finally(() => setStickerLoading(false));
    });
  }, [setStickerLoading, setStickers, stickerLoading, stickersLoaded]);
}

function useResetStickerTabWhenDisabled(
  stickerCustomEnabled: boolean,
  tab: "emoji" | "sticker",
  setTab: (value: "emoji" | "sticker") => void,
) {
  useEffect(() => {
    if (!stickerCustomEnabled && tab === "sticker") {
      setTab("emoji");
    }
  }, [setTab, stickerCustomEnabled, tab]);
}

/**
 * Emoji 面板(对应旧 dmworkbase Components/EmojiToolbar EmojiPanel,1:1 复刻):
 *
 * - emoji 网格
 * - 可选 sticker tab 由远端 appconfig 控制
 *
 * 资源 = EMOJI_LIST(152 unicode + 3 自家 custom token,顺序对齐旧 EmojiService.ts);
 * png = `/emoji/${name}.png`(225 个从旧 web/public/emoji/ 拷过来)。
 */
export function EmojiPickerPopover({
  open,
  containerRef,
  onSelect,
  onStickerSelect,
  onClose,
}: EmojiPickerPopoverProps) {
  const t = useT();
  useClickOutside(containerRef, onClose, open);
  const emojiItems = useEmojiItems();
  const stickerCustomEnabled = useStickerCustomEnabled();
  const [tab, setTab] = useState<"emoji" | "sticker">("emoji");
  const [stickers, setStickers] = useState<StickerItem[]>([]);
  const [stickersLoaded, setStickersLoaded] = useState(false);
  const [stickerLoading, setStickerLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const stickerInputRef = useRef<HTMLInputElement>(null);
  useResetPopoverOnClose(open, setTab);
  useLoadStickersOnTabOpen({
    open,
    tab,
    stickersLoaded,
    stickerLoading,
    setStickerLoading,
    setStickersLoaded,
    setStickers,
  });
  useRefreshLoadedStickersOnEvent({
    stickersLoaded,
    stickerLoading,
    setStickerLoading,
    setStickers,
  });
  useResetStickerTabWhenDisabled(stickerCustomEnabled, tab, setTab);

  if (!open) return null;
  return (
    <div
      className="absolute bottom-full left-0 z-popover mb-2 flex flex-col overflow-hidden rounded-xl border border-border-subtle bg-bg-surface shadow-lg"
      style={{ width: 460, height: 372 }}
    >
      {tab === "emoji" ? (
        <div className="flex-1 overflow-y-auto">
          <ul
            role="listbox"
            aria-label={t("emojiPicker.emojiLabel")}
            className="flex flex-wrap"
            style={{ padding: "13px", marginLeft: "8px" }}
          >
            {emojiItems.map((emoji) => (
              <li key={emoji.key} style={{ padding: "6px 4px" }}>
                <button
                  type="button"
                  title={emoji.key}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(emoji.key);
                  }}
                  className="cursor-pointer rounded-md transition-transform hover:scale-110"
                >
                  <img
                    src={emoji.url}
                    alt={emoji.key}
                    width={28}
                    height={28}
                    style={{ width: 28, height: 28, objectFit: "contain", display: "block" }}
                    loading="lazy"
                    draggable={false}
                  />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="flex flex-1 flex-col overflow-hidden">
          <input
            ref={stickerInputRef}
            type="file"
            accept="image/gif,image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file || !stickerCustomEnabled) return;
              if (file.size > 1024 * 1024) {
                message.error(t("sticker.uploadTooLarge"));
                return;
              }
              setUploading(true);
              uploadStickerFile(file)
                .then((uploaded) => addUserSticker(uploaded))
                .then((sticker) => {
                  setStickers((prev) => [sticker, ...prev]);
                  setStickersLoaded(true);
                  notifyStickersUpdated(sticker);
                  message.success(t("sticker.uploaded"));
                })
                .catch((err: unknown) =>
                  message.error(err instanceof Error ? err.message : t("sticker.uploadFailed")),
                )
                .finally(() => setUploading(false));
            }}
          />
          <div className="flex-1 overflow-y-auto p-[13px]">
            {stickerLoading ? (
              <div className="flex h-full items-center justify-center text-[12px] text-text-tertiary">
                {t("base.common.loading")}
              </div>
            ) : (
              <ul className="flex flex-wrap content-start gap-2">
                <li>
                  <button
                    type="button"
                    title={t("sticker.upload")}
                    disabled={uploading}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!uploading) stickerInputRef.current?.click();
                    }}
                    className="flex h-[74px] w-[74px] items-center justify-center rounded-xl border-[1.5px] border-dashed border-border-default text-text-tertiary transition-colors hover:border-brand hover:bg-brand/6 hover:text-brand disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {uploading ? (
                      <Loader2 size={24} className="animate-spin" />
                    ) : (
                      <ImagePlus size={24} />
                    )}
                  </button>
                </li>
                {stickers.map((sticker) => {
                  const id = sticker.sticker_id || sticker.id || sticker.path;
                  const src = sticker.path || sticker.url || sticker.placeholder || "";
                  return (
                    <li key={id} className="group relative">
                      <button
                        type="button"
                        onClick={() => onStickerSelect(sticker)}
                        className="flex h-[74px] w-[74px] items-center justify-center overflow-hidden rounded-xl bg-bg-elevated p-[7px] transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-md"
                      >
                        <img
                          src={src}
                          alt={sticker.name || t("sticker.messageAlt")}
                          className="h-[60px] w-[60px] object-contain"
                          draggable={false}
                        />
                      </button>
                      {sticker.sticker_id || sticker.id ? (
                        <button
                          type="button"
                          aria-label={t("sticker.delete")}
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteUserSticker(sticker.sticker_id || sticker.id || "")
                              .then(() => {
                                setStickers((prev) => prev.filter((x) => x !== sticker));
                                notifyStickersUpdated();
                              })
                              .catch(() => message.error(t("sticker.deleteFailed")));
                          }}
                          className="absolute top-1 right-1 flex h-[18px] w-[18px] scale-80 items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition hover:bg-danger group-hover:scale-100 group-hover:opacity-100"
                        >
                          <X size={12} />
                        </button>
                      ) : null}
                    </li>
                  );
                })}
                {stickers.length === 0 && !uploading ? (
                  <li className="w-full cursor-default pt-[14px] text-center text-[13px] text-text-tertiary">
                    {t("sticker.empty")}
                  </li>
                ) : null}
              </ul>
            )}
          </div>
        </div>
      )}
      {/* tab 条 — 当前只有 emoji,sticker tab P3+ 接 sticker.api 时再补 */}
      <div
        className="flex shrink-0 overflow-x-auto overflow-y-hidden border-t border-border-subtle bg-bg-elevated"
        style={{ height: 40 }}
      >
        <button
          type="button"
          className={`flex shrink-0 items-center justify-center ${tab === "emoji" ? "bg-bg-surface" : ""}`}
          style={{ width: 60, height: 40 }}
          aria-label={t("emojiPicker.emojiLabel")}
          aria-selected={tab === "emoji"}
          onClick={() => setTab("emoji")}
        >
          <Smile size={19} />
        </button>
        {stickerCustomEnabled ? (
          <button
            type="button"
            className={`flex shrink-0 items-center justify-center ${tab === "sticker" ? "bg-bg-surface" : ""}`}
            style={{ width: 60, height: 40 }}
            aria-label={t("sticker.tab")}
            aria-selected={tab === "sticker"}
            onClick={() => setTab("sticker")}
          >
            <ImagePlus size={19} />
          </button>
        ) : null}
      </div>
    </div>
  );
}
