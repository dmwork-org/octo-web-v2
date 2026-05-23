import { useLayoutEffect, useRef, useState, useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

export interface ContextMenuItem {
  /** 分隔线;其他字段忽略。 */
  separator?: boolean;
  label?: string;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  /** 选中态(子菜单项右侧 ✓)。 */
  checked?: boolean;
  /** 子菜单(hover 父项展开)。children 存在时本身 onClick 不触发。 */
  children?: ContextMenuItem[];
  onClick?: () => void;
}

interface ContextMenuProps {
  open: boolean;
  /** 鼠标 clientX */
  x: number;
  /** 鼠标 clientY */
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

const MARGIN = 8;
const SUBMENU_W = 160;

interface MeasuredPos {
  left: number;
  top: number;
  origin: number;
  flipSubmenu: boolean;
}

/**
 * RAF 两帧测量 + 翻转计算(命名 hook,把 useLayoutEffect 抽出 component 本体)。
 */
function useMeasureMenuPosition(
  open: boolean,
  x: number,
  y: number,
  ref: React.RefObject<HTMLDivElement | null>,
) {
  const [pos, setPos] = useState<MeasuredPos | null>(null);
  const [animateIn, setAnimateIn] = useState(false);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      setAnimateIn(false);
      return;
    }
    const el = ref.current;
    if (!el) return;
    el.style.visibility = "hidden";
    const raf = requestAnimationFrame(() => {
      const screenW = window.innerWidth;
      const screenH = window.innerHeight;
      const rootW = el.offsetWidth || 200;
      const rootH = el.offsetHeight || 0;
      const showLeft = screenW - x < rootW + MARGIN;
      const showBottom = screenH - y < rootH + MARGIN;
      const left = showLeft
        ? Math.max(MARGIN, x - rootW)
        : Math.min(x + 5, screenW - rootW - MARGIN);
      const top = showBottom ? Math.max(MARGIN, y - rootH) : Math.min(y, screenH - rootH - MARGIN);
      const origin = showBottom ? rootH : 0;
      const flipSubmenu = screenW - left - rootW < SUBMENU_W + MARGIN;
      setPos({ left, top, origin, flipSubmenu });
      el.style.visibility = "";
      requestAnimationFrame(() => setAnimateIn(true));
    });
    return () => cancelAnimationFrame(raf);
  }, [open, x, y, ref]);

  return { pos, animateIn };
}

/** 命名 hook 包 Esc + scroll capture 关闭。 */
function useDismissEvents(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onScroll = () => onClose();
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, onClose]);
}

/**
 * 通用右键菜单(对应旧 dmworkbase Components/ContextMenus,1:1 复刻):
 *
 * 视觉:
 * - 容器 bg #FFFFFF / border #E5E6EB / radius 8 / shadow lg
 * - 项 height 40 / padding 0 16 / font-size 14 / hover bg #F2F3F5
 * - danger 项红色
 * - 分隔线 1px #F2F3F5 + 4px margin
 * - 进入动画:scale 0.92 → 1 + opacity 0 → 1,150ms cubic-bezier(0.16, 1, 0.3, 1)
 *
 * 定位:
 * - RAF 两帧:第一帧 invisible 量真实尺寸;第二帧根据剩余空间决定 showLeft/showBottom 翻转
 * - transformOrigin 由 showBottom 翻转(让动画从鼠标侧弹出)
 * - flipSubmenu 当容器右侧空间不足以放 SUBMENU_W 时,子菜单向左展开
 *
 * 关闭:
 * - 全屏 mask click(覆盖整个视口拦截)
 * - Esc / scroll capture
 *
 * 子菜单:CSS 驱动 hover 展开(group/row 父项 hover 时子菜单显示),不需要 JS 记录
 * hover state。隐形桥接 ::before 覆盖父子之间 4px 间隙,防止对角线移动失效。
 */
export function ContextMenu({ open, x, y, items, onClose }: ContextMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const { pos, animateIn } = useMeasureMenuPosition(open, x, y, rootRef);
  useDismissEvents(open, onClose);

  if (!open) return null;

  const handleItemClick = (item: ContextMenuItem) => {
    if (item.disabled) return;
    if (item.children && item.children.length > 0) return;
    item.onClick?.();
    onClose();
  };

  const flipSubmenu = pos?.flipSubmenu ?? false;

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[98]"
        onClick={onClose}
        onContextMenu={(e) => e.preventDefault()}
      />
      <div
        ref={rootRef}
        style={{
          position: "fixed",
          left: pos?.left ?? -9999,
          top: pos?.top ?? -9999,
          transformOrigin: `-3px ${pos?.origin ?? 0}px`,
          transform: animateIn ? "scale(1)" : "scale(0.92)",
          opacity: animateIn ? 1 : 0,
          transition:
            "opacity 0.15s cubic-bezier(0.16, 1, 0.3, 1), transform 0.15s cubic-bezier(0.16, 1, 0.3, 1)",
          zIndex: 99,
        }}
        className="min-w-[160px] overflow-visible rounded-lg border border-[#E5E6EB] bg-white p-0 shadow-[0_4px_12px_rgba(0,0,0,0.1)] dark:border-border-default dark:bg-bg-surface"
        onContextMenu={(e) => e.preventDefault()}
      >
        <ul className="m-0 list-none p-0">
          {items.map((item, idx) => (
            <ContextMenuRow
              key={idx}
              item={item}
              flipSubmenu={flipSubmenu}
              onSelect={handleItemClick}
            />
          ))}
        </ul>
      </div>
    </>,
    document.body,
  );
}

function ContextMenuRow({
  item,
  flipSubmenu,
  onSelect,
}: {
  item: ContextMenuItem;
  flipSubmenu: boolean;
  onSelect: (item: ContextMenuItem) => void;
}) {
  if (item.separator) {
    return <li role="separator" className="my-1 h-px bg-[#F2F3F5] dark:bg-border-subtle" />;
  }
  const hasChildren = !!item.children?.length;
  const baseRow =
    "group/row relative flex h-10 cursor-pointer items-center gap-2 px-4 text-[14px] transition-colors duration-150";
  const colorCls = item.disabled
    ? "cursor-not-allowed text-text-tertiary"
    : item.danger
      ? "text-error hover:bg-[#F2F3F5] dark:hover:bg-bg-hover"
      : "text-[#1D2129] hover:bg-[#F2F3F5] dark:text-text-primary dark:hover:bg-bg-hover";

  return (
    <li
      className={`${baseRow} ${colorCls}`}
      onClick={(e) => {
        if (hasChildren) {
          e.stopPropagation();
          return;
        }
        onSelect(item);
      }}
    >
      {item.icon ? <span className="shrink-0">{item.icon}</span> : null}
      <span className="flex-1 truncate">{item.label}</span>
      {item.checked ? (
        <span className="ml-1 shrink-0 text-[13px] font-semibold text-brand">✓</span>
      ) : null}
      {hasChildren ? (
        <>
          <svg
            className="ml-auto h-3 w-3 shrink-0 stroke-[#4E5969] dark:stroke-text-secondary"
            viewBox="0 0 24 24"
            fill="none"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <ul
            className={`absolute top-0 z-[100] hidden min-w-[160px] list-none rounded-lg border border-[#E5E6EB] bg-white p-0 shadow-[0_4px_12px_rgba(0,0,0,0.1)] group-hover/row:block before:absolute before:top-[-4px] before:bottom-[-4px] before:w-2 before:content-[''] dark:border-border-default dark:bg-bg-surface ${
              flipSubmenu
                ? "right-[calc(100%+4px)] before:right-[-8px]"
                : "left-[calc(100%+4px)] before:left-[-8px]"
            }`}
          >
            {item.children!.map((child, ci) => (
              <ContextMenuRow key={ci} item={child} flipSubmenu={flipSubmenu} onSelect={onSelect} />
            ))}
          </ul>
        </>
      ) : null}
    </li>
  );
}
