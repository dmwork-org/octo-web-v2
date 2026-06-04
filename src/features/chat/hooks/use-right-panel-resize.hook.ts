import { useResizablePanel, type ResizablePanelApi } from "./use-resizable-panel.hook";

/**
 * Chat 右侧 panel(thread / file preview / matter)宽度拖拽共用配置 + hook。
 *
 * 老仓 ThreadPanel + FilePreviewPanel 是**同一组件**兼任两种内容,共享一份 width state +
 * localStorage `wk-thread-panel-width`。新仓 thread / filePreview / matter 是 3 个独立
 * 组件,通过 chatSidePanelStore 互斥渲染(同时只显一个),三者**共享 storage key** 实现
 * "切 panel 类型 width 不变" 联动。
 *
 * range + 默认 1:1 老仓 layoutWidth.ts THREAD_*:
 *   default 432 / min 432 / hard max 1600
 *   dynamic max:(window - leftSidebar) * 0.5(保 chat 区 ≥ 50% 可用空间)
 */

const RIGHT_PANEL_STORAGE_KEY = "wk-thread-panel-width";
const RIGHT_PANEL_DEFAULT_WIDTH = 432;
const RIGHT_PANEL_MIN_WIDTH = 432;
const RIGHT_PANEL_MAX_HARD = 1600;
const SIDEBAR_STORAGE_KEY = "wk-layout-left-width";
const SIDEBAR_DEFAULT_FALLBACK = 300;
const SIDEBAR_MIN = 190;
const SIDEBAR_MAX = 360;

function readSidebarWidth(): number {
  if (typeof window === "undefined") return SIDEBAR_DEFAULT_FALLBACK;
  try {
    const raw = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (raw) {
      const n = parseInt(raw, 10);
      if (!Number.isNaN(n) && n >= SIDEBAR_MIN && n <= SIDEBAR_MAX) return n;
    }
  } catch {
    // ignore
  }
  return SIDEBAR_DEFAULT_FALLBACK;
}

function getRightPanelMaxWidth(windowWidth: number): number {
  const leftPanelWidth = readSidebarWidth();
  const dynamicMax = Math.floor((windowWidth - leftPanelWidth) * 0.5);
  return Math.max(RIGHT_PANEL_MIN_WIDTH, Math.min(RIGHT_PANEL_MAX_HARD, dynamicMax));
}

/**
 * thread / file preview / matter 3 个右侧 panel 共用拖拽 hook。
 * 内部固定 edge='left',storageKey 共享,default/min/getMaxWidth 已配。
 */
export function useRightPanelResize(): ResizablePanelApi {
  return useResizablePanel({
    storageKey: RIGHT_PANEL_STORAGE_KEY,
    defaultWidth: RIGHT_PANEL_DEFAULT_WIDTH,
    minWidth: RIGHT_PANEL_MIN_WIDTH,
    getMaxWidth: getRightPanelMaxWidth,
    edge: "left",
  });
}
