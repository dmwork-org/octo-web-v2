import { useEffect } from "react";
import { EMOJI_LIST, emojiImageUrl } from "@/features/chat/lib/emoji-data";

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
 * 旧版 css 关键尺寸(EmojiToolbar/index.css):
 *   .wk-emojitoolbar-emojipanel: max-width 460px / height 372px / radius 0.75rem
 *   .wk-emojipanel-tab: height 40px(底部 tab 条)
 *   .wk-emojipanel-content: 余下 332px,overflow-y auto
 *   .wk-emojipanel-content ul: flex-wrap + padding 13px + margin-left 8px(无固定列数)
 *   li: padding 6px 4px;img: 28×28
 *
 * 数据 = EMOJI_LIST(152 unicode + 3 自家 custom token,顺序对齐旧 EmojiService.ts);
 * 资源 = `/emoji/${name}.png`(225 个 png 整目录从旧 web/public/emoji/ 拷过来)。
 *
 * tab 区:目前只有 emoji 一个 tab(选中态白底),sticker 分类 P3+ 接 commonDataSource
 * .userStickerCategory 时再补,占位保持视觉一致。
 *
 * 不做(P3+):sticker 分类 / 最近使用 / custom token 在消息体内替换回 png(走 renderer)。
 */
export function EmojiPickerPopover({
  open,
  containerRef,
  onSelect,
  onClose,
}: EmojiPickerPopoverProps) {
  useClickOutside(containerRef, onClose, open);

  if (!open) return null;
  return (
    <div
      className="absolute bottom-full left-0 z-50 mb-2 flex flex-col overflow-hidden rounded-xl border border-border-subtle bg-bg-surface shadow-lg"
      style={{ width: 460, height: 372 }}
    >
      {/* emoji 网格区(372 - 40 = 332px) */}
      <div className="flex-1 overflow-y-auto">
        <ul
          role="listbox"
          aria-label="表情"
          className="flex flex-wrap"
          style={{ padding: "13px", marginLeft: "8px" }}
        >
          {EMOJI_LIST.map((emoji) => (
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
      </div>

      {/* tab 条 — 当前只有 emoji,选中态白底(对齐旧 .wk-emojipanel-tab-item-selected) */}
      <div
        className="flex shrink-0 overflow-x-auto overflow-y-hidden border-t border-border-subtle bg-bg-elevated"
        style={{ height: 40 }}
      >
        <div
          className="flex shrink-0 items-center justify-center bg-bg-surface"
          style={{ width: 60, height: 40 }}
          aria-label="表情"
          aria-selected
        >
          <img src={emojiImageUrl("0_0")} alt="" width={20} height={20} draggable={false} />
        </div>
      </div>
    </div>
  );
}
