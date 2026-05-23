import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

export interface ContextMenuItem {
  /** 分隔线;其他字段忽略。 */
  separator?: boolean;
  label?: string;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

interface ContextMenuProps {
  open: boolean;
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

/**
 * 通用右键菜单(对应旧 dmworkbase Components/ContextMenus)。
 *
 * - portal 到 document.body,固定定位在 (x, y)
 * - 点 outside / Esc / 选中 item → close
 * - 边界:若 x+menuW 越右,自动向左偏;y+menuH 越下同理(P2,先简单方案)
 *
 * 调用方持有 open / x / y state,通过 onContextMenu 触发:
 *   const onContextMenu = (e: React.MouseEvent) => {
 *     e.preventDefault();
 *     setMenu({ open: true, x: e.clientX, y: e.clientY });
 *   };
 */
function useCloseOnGlobalEvents(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onClick = () => onClose();
    const onScroll = () => onClose();
    window.addEventListener("keydown", onKey);
    // mousedown 在下一帧触发,避免触发本次右键的 onClick
    requestAnimationFrame(() => {
      document.addEventListener("mousedown", onClick);
    });
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, onClose]);
}

export function ContextMenu({ open, x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  useCloseOnGlobalEvents(open, onClose);

  if (!open) return null;

  // 简单边界处理:用 vw/vh 截断,完整翻转留 Wave 3
  const maxX = typeof window !== "undefined" ? window.innerWidth - 200 : x;
  const maxY = typeof window !== "undefined" ? window.innerHeight - items.length * 32 - 16 : y;
  const left = Math.min(x, maxX);
  const top = Math.min(y, maxY);

  return createPortal(
    <div
      ref={ref}
      style={{ position: "fixed", left, top, zIndex: 100 }}
      className="flex min-w-[160px] flex-col rounded-md border border-border-default bg-bg-surface py-1 shadow-xl"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {items.map((item, idx) =>
        item.separator ? (
          <div key={`sep-${idx}`} className="my-1 h-px shrink-0 bg-border-subtle" aria-hidden />
        ) : (
          <button
            key={`${item.label}-${idx}`}
            type="button"
            disabled={item.disabled}
            onClick={() => {
              item.onClick?.();
              onClose();
            }}
            className={`flex shrink-0 items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
              item.disabled
                ? "cursor-not-allowed text-text-tertiary"
                : item.danger
                  ? "text-error hover:bg-error/10"
                  : "text-text-primary hover:bg-bg-hover"
            }`}
          >
            {item.icon ? <span className="shrink-0">{item.icon}</span> : null}
            <span className="flex-1">{item.label}</span>
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}
