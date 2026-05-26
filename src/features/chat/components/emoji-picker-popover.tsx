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
 * - 数据 = EMOJI_LIST(152 个 unicode + 3 个自家 custom token,从旧 EmojiService 平移)
 * - 资源 = `/emoji/${name}.png`(225 个 png 整目录从旧 web/public/emoji/ 拷过来)
 * - 网格 8 列,每格 36×36,内嵌 28×28 png(对齐旧 wk-emojipanel-content > ul > li)
 * - 滚动:max-height 240px(约 6 行)
 * - 点击 → onSelect 回调 emoji.key(unicode 或 [xxx] token),由 Composer 插入到 editor
 *
 * 不做(P3+ 补):
 * - sticker 分类 tab(`tgs-player` Lottie 表情,需后端 API + lottie 渲染)
 * - 最近使用(localStorage 维护)
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
    <div className="absolute bottom-full left-0 z-50 mb-2 w-80 rounded-md border border-border-subtle bg-bg-surface p-2 shadow-lg">
      <ul
        role="listbox"
        aria-label="表情"
        className="grid max-h-60 grid-cols-8 gap-0.5 overflow-y-auto"
      >
        {EMOJI_LIST.map((emoji) => (
          <li key={emoji.name}>
            <button
              type="button"
              title={emoji.key}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(emoji.key);
              }}
              className="flex h-9 w-9 items-center justify-center rounded-md transition-colors hover:bg-bg-hover"
            >
              <img
                src={emojiImageUrl(emoji.name)}
                alt={emoji.key}
                width={28}
                height={28}
                style={{ width: 28, height: 28, objectFit: "contain" }}
                loading="lazy"
                draggable={false}
              />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
