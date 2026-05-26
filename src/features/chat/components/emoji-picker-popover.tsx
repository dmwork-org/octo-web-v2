import { useEffect, useRef } from "react";
import Picker from "@emoji-mart/react";
import data from "@emoji-mart/data";

interface EmojiPickerPopoverProps {
  open: boolean;
  /** 含按钮 + 面板的 wrapper ref(用于点外面关) */
  containerRef: React.RefObject<HTMLElement | null>;
  onSelect: (native: string) => void;
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
 * Emoji 面板(对应旧 dmworkbase ChatToolbar.emoji):
 *
 * - 用 emoji-mart `<Picker>` 渲染面板,内置搜索 / 分类 / 最近使用
 * - 选中后 onSelect 回调 native emoji 字符串(unicode),由 Composer 插入到 editor
 * - 容器 ref 用于点外面关闭(由 Composer 用同一个按钮 wrapper 提供)
 *
 * Picker 的 onEmojiSelect 回调签名:`{ native: string, ... }`
 * 主题用 light(项目默认浅色),i18n 默认英文(emoji-mart 内置中文翻译需另外装包,
 * 后续如需可接 `i18n: import('@emoji-mart/data/i18n/zh.json')`)。
 */
export function EmojiPickerPopover({
  open,
  containerRef,
  onSelect,
  onClose,
}: EmojiPickerPopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useClickOutside(containerRef, onClose, open);

  if (!open) return null;
  return (
    <div
      ref={panelRef}
      className="absolute bottom-full left-0 z-50 mb-2"
      // emoji-mart 自带 shadcn-incompat 的样式,套个外层确保不影响布局
    >
      <Picker
        data={data}
        theme="light"
        previewPosition="none"
        skinTonePosition="search"
        onEmojiSelect={(emoji: { native?: string }) => {
          if (emoji.native) onSelect(emoji.native);
        }}
      />
    </div>
  );
}
