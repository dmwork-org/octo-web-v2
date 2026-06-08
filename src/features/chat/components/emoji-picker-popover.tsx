import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { EMOJI_LIST, emojiImageUrl } from "@/features/chat/lib/emoji-data";
import { useT } from "@/lib/i18n/use-t";

interface EmojiPickerPopoverProps {
  open: boolean;
  /** 含按钮 + 面板的 wrapper ref(用于点外面关) */
  containerRef: React.RefObject<HTMLElement | null>;
  /** 用户选中 emoji 后回调 token(unicode 字符 或 自家 [xxx] token,直接插 editor) */
  onSelect: (token: string) => void;
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
  onClose,
}: EmojiPickerPopoverProps) {
  const t = useT();
  useClickOutside(containerRef, onClose, open);
  const [keyword, setKeyword] = useState("");

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return EMOJI_LIST;
    return EMOJI_LIST.filter((e) => e.key.toLowerCase().includes(kw));
  }, [keyword]);

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
      {/* emoji 网格区(剩余高度) */}
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
              <li key={emoji.name} style={{ padding: "6px 4px" }}>
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
                    src={emojiImageUrl(emoji.name)}
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
      {/* tab 条 — 当前只有 emoji,sticker tab P3+ 接 sticker.api 时再补 */}
      <div
        className="flex shrink-0 overflow-x-auto overflow-y-hidden border-t border-border-subtle bg-bg-elevated"
        style={{ height: 40 }}
      >
        <div
          className="flex shrink-0 items-center justify-center bg-bg-surface"
          style={{ width: 60, height: 40 }}
          aria-label={t("emojiPicker.emojiLabel")}
          aria-selected
        >
          <img src={emojiImageUrl("0_0")} alt="" width={20} height={20} draggable={false} />
        </div>
      </div>
    </div>
  );
}
