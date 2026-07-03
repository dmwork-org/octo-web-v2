import { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Search, Smile, Trash2 } from "lucide-react";
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

function useResetPopoverOnClose(
  open: boolean,
  setKeyword: (value: string) => void,
  setTab: (value: "emoji" | "sticker") => void,
) {
  useEffect(() => {
    if (!open) {
      setKeyword("");
      setTab("emoji");
    }
  }, [open, setKeyword, setTab]);
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

/**
 * Emoji 面板(对应旧 dmworkbase Components/EmojiToolbar EmojiPanel,1:1 复刻):
 *
 * - emoji 网格 + 顶部 search 框(过滤 emoji.key 子串)
 * - tab 区目前只有 emoji 一个(sticker 分类 P3+ 接 commonDataSource)
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
  const [keyword, setKeyword] = useState("");
  const [tab, setTab] = useState<"emoji" | "sticker">("emoji");
  const [stickers, setStickers] = useState<StickerItem[]>([]);
  const [stickersLoaded, setStickersLoaded] = useState(false);
  const [stickerLoading, setStickerLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const stickerInputRef = useRef<HTMLInputElement>(null);
  useResetPopoverOnClose(open, setKeyword, setTab);
  useLoadStickersOnTabOpen({
    open,
    tab,
    stickersLoaded,
    stickerLoading,
    setStickerLoading,
    setStickersLoaded,
    setStickers,
  });

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return emojiItems;
    return emojiItems.filter((e) => e.key.toLowerCase().includes(kw) || e.name.includes(kw));
  }, [emojiItems, keyword]);

  if (!open) return null;
  return (
    <div
      className="absolute bottom-full left-0 z-popover mb-2 flex flex-col overflow-hidden rounded-xl border border-border-subtle bg-bg-surface shadow-lg"
      style={{ width: 460, height: 372 }}
    >
      {/* 顶部 search 框(audit-v2 §2.4 emoji 搜索) */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle bg-bg-elevated px-3 py-2">
        <Search size={14} className="shrink-0 text-text-tertiary" />
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder={t("emojiPicker.searchPlaceholder")}
          className="flex-1 border-0 bg-transparent text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none"
        />
      </div>
      {tab === "emoji" ? (
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex h-full items-center justify-center text-[12px] text-text-tertiary">
              {t("emojiPicker.noMatches")}
            </div>
          ) : (
            <ul
              role="listbox"
              aria-label={t("emojiPicker.emojiLabel")}
              className="flex flex-wrap"
              style={{ padding: "13px", marginLeft: "8px" }}
            >
              {filtered.map((emoji) => (
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
          )}
        </div>
      ) : (
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 justify-end border-b border-border-subtle px-3 py-2">
            <input
              ref={stickerInputRef}
              type="file"
              accept="image/gif,image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
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
                    message.success(t("sticker.uploaded"));
                  })
                  .catch((err: unknown) =>
                    message.error(err instanceof Error ? err.message : t("sticker.uploadFailed")),
                  )
                  .finally(() => setUploading(false));
              }}
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => stickerInputRef.current?.click()}
              className="inline-flex h-7 items-center gap-1 rounded border border-border-default px-2 text-xs text-text-secondary hover:bg-bg-hover disabled:opacity-50"
            >
              <ImagePlus size={14} />
              {uploading ? t("sticker.uploading") : t("sticker.upload")}
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {stickerLoading ? (
              <div className="flex h-full items-center justify-center text-[12px] text-text-tertiary">
                {t("base.common.loading")}
              </div>
            ) : stickers.length === 0 ? (
              <div className="flex h-full items-center justify-center text-[12px] text-text-tertiary">
                {t("sticker.empty")}
              </div>
            ) : (
              <ul className="grid grid-cols-5 gap-2">
                {stickers.map((sticker) => {
                  const id = sticker.sticker_id || sticker.id || sticker.path;
                  const src = sticker.path || sticker.url || sticker.placeholder || "";
                  return (
                    <li key={id} className="group relative">
                      <button
                        type="button"
                        onClick={() => onStickerSelect(sticker)}
                        className="flex aspect-square w-full items-center justify-center rounded-md border border-border-subtle bg-bg-base p-1 hover:bg-bg-hover"
                      >
                        <img
                          src={src}
                          alt={sticker.name || t("sticker.messageAlt")}
                          className="max-h-full max-w-full object-contain"
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
                              .then(() => setStickers((prev) => prev.filter((x) => x !== sticker)))
                              .catch(() => message.error(t("sticker.deleteFailed")));
                          }}
                          className="absolute top-1 right-1 hidden h-5 w-5 items-center justify-center rounded bg-bg-surface/90 text-danger shadow group-hover:flex"
                        >
                          <Trash2 size={12} />
                        </button>
                      ) : null}
                    </li>
                  );
                })}
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
      </div>
    </div>
  );
}
