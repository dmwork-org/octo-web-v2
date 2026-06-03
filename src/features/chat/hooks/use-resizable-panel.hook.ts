import { useCallback, useEffect, useRef, useState } from "react";

export interface UseResizablePanelOptions {
  /**
   * localStorage key 持久化 width。
   * sidebar / thread-panel / file-preview 可共享同一个 key 实现联动(老仓
   * thread-panel 和 file-preview-panel 共用 wk-thread-panel-width)。
   */
  storageKey: string;
  defaultWidth: number;
  minWidth: number;
  /**
   * 动态 max。**入参是 window.innerWidth**(老仓 thread panel 计算时
   * 还会扣减 leftPanel,要求 chat 区 ≥ 50% 可用空间);simple 场景直接
   * 返回固定 max(如 sidebar)。
   */
  getMaxWidth: (windowWidth: number) => number;
  /**
   * 拖拽边缘:
   * - 'right' = splitter 在 panel 右侧(sidebar 类),拖右 = 变宽 → delta = clientX - startX
   * - 'left'  = splitter 在 panel 左侧(thread/file panel 类),拖左 = 变宽 → delta = startX - clientX
   */
  edge: "left" | "right";
}

export interface ResizablePanelApi {
  width: number;
  isDragging: boolean;
  /** 挂在 panel 容器 DOM 上 — drag 时直接 ref.current.style.width 写,跳 React 重渲 */
  panelRef: React.RefObject<HTMLDivElement | null>;
  /** splitter mouseDown */
  onSplitterMouseDown: (e: React.MouseEvent) => void;
  /** splitter 双击 → 重置默认宽(老仓 onDoubleClick) */
  onSplitterDoubleClick: () => void;
}

/**
 * 通用 panel 宽度拖拽 hook,1:1 对齐老仓 WKLayout / ThreadPanel 的拖拽机制:
 *
 * - **direct DOM 写 width 跳 React**:drag 中 60fps mousemove 不触发 setState,
 *   只在 mouseup 时 commit final width 到 state(单次重渲)+ localStorage 持久化
 * - **body cursor + userSelect 同步**:drag 中 `cursor: col-resize` + 禁选,
 *   防止文本被意外高亮 / 鼠标视觉不连贯
 * - **全屏 drag-overlay**:isDragging 时上层渲一个 z-9999 fixed overlay,
 *   防 iframe / 嵌入内容抢 mousemove 事件
 * - **clamp**:每次写都 clamp 到 [min, getMaxWidth(window.innerWidth)] 范围
 * - **双击重置**:onSplitterDoubleClick → defaultWidth + persist
 * - **localStorage**:restore on mount(clamp 防 storage stale)+ persist on drag end
 *
 * 用法:
 *   const { width, panelRef, onSplitterMouseDown, onSplitterDoubleClick, isDragging } =
 *     useResizablePanel({ storageKey, defaultWidth, minWidth, getMaxWidth, edge });
 *
 *   <aside ref={panelRef} style={{ width }}>...</aside>
 *   <Splitter onMouseDown={onSplitterMouseDown} onDoubleClick={onSplitterDoubleClick} />
 *   {isDragging && <DragOverlay />}
 */
function safeReadStored(key: string, min: number, max: number, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw) {
      const n = parseInt(raw, 10);
      if (!Number.isNaN(n) && n >= min && n <= max) return n;
    }
  } catch {
    // 私密模式 / quota 异常,静默
  }
  return fallback;
}

function safeWriteStored(key: string, width: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, String(width));
  } catch {
    // ignore
  }
}

function useCleanupDragListeners(
  handlerRef: React.RefObject<{
    move: ((e: MouseEvent) => void) | null;
    up: (() => void) | null;
  }>,
): void {
  useEffect(() => {
    return () => {
      const h = handlerRef.current;
      if (h?.move) document.removeEventListener("mousemove", h.move);
      if (h?.up) document.removeEventListener("mouseup", h.up);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [handlerRef]);
}

export function useResizablePanel(opts: UseResizablePanelOptions): ResizablePanelApi {
  const { storageKey, defaultWidth, minWidth, getMaxWidth, edge } = opts;
  const clampInit = Math.max(
    minWidth,
    Math.min(getMaxWidth(typeof window !== "undefined" ? window.innerWidth : 1920), defaultWidth),
  );
  const initial = safeReadStored(storageKey, minWidth, 99999, clampInit);

  const [width, setWidth] = useState<number>(initial);
  const [isDragging, setIsDragging] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // 拖拽中的实时值,避免 closure 拿到 stale state
  const lastWidthRef = useRef<number>(initial);
  const dragStartXRef = useRef<number>(0);
  const dragStartWidthRef = useRef<number>(0);
  const cachedMaxRef = useRef<number>(
    getMaxWidth(typeof window !== "undefined" ? window.innerWidth : 1920),
  );
  // 注册到 document 的 handler,unmount 清理用
  const handlersRef = useRef<{
    move: ((e: MouseEvent) => void) | null;
    up: (() => void) | null;
  }>({ move: null, up: null });
  useCleanupDragListeners(handlersRef);

  const clamp = useCallback(
    (w: number) => Math.max(minWidth, Math.min(cachedMaxRef.current, w)),
    [minWidth],
  );

  const onSplitterMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragStartXRef.current = e.clientX;
      dragStartWidthRef.current = lastWidthRef.current;
      cachedMaxRef.current = getMaxWidth(window.innerWidth);
      setIsDragging(true);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const onMove = (ev: MouseEvent) => {
        const delta =
          edge === "left" ? dragStartXRef.current - ev.clientX : ev.clientX - dragStartXRef.current;
        const next = clamp(dragStartWidthRef.current + delta);
        lastWidthRef.current = next;
        const el = panelRef.current;
        if (el) el.style.width = `${next}px`;
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        handlersRef.current = { move: null, up: null };
        setIsDragging(false);
        setWidth(lastWidthRef.current);
        safeWriteStored(storageKey, lastWidthRef.current);
      };
      handlersRef.current = { move: onMove, up: onUp };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [clamp, edge, getMaxWidth, storageKey],
  );

  const onSplitterDoubleClick = useCallback(() => {
    cachedMaxRef.current = getMaxWidth(window.innerWidth);
    const next = clamp(defaultWidth);
    lastWidthRef.current = next;
    setWidth(next);
    safeWriteStored(storageKey, next);
    const el = panelRef.current;
    if (el) el.style.width = `${next}px`;
  }, [clamp, defaultWidth, getMaxWidth, storageKey]);

  return { width, isDragging, panelRef, onSplitterMouseDown, onSplitterDoubleClick };
}
