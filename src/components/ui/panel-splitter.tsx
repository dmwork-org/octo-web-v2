interface PanelSplitterProps {
  /**
   * 'left' = splitter 在 panel 左侧(被拖 panel 在右,如 thread / file preview)
   * 'right' = splitter 在 panel 右侧(被拖 panel 在左,如 sidebar)
   */
  side: "left" | "right";
  isDragging?: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onDoubleClick?: () => void;
}

/**
 * panel 之间的拖拽 splitter(1:1 对齐老仓 .wk-layout-splitter):
 *
 * - 12px 宽 hit area(看不见,但用户鼠标进入即触发 col-resize)
 * - 内部 0→3px 紫色细线(hover/active 时显,brand 色 #1c1c23 — 跟老仓 brand-primary
 *   一致;line transition 200ms 顺滑)
 * - cursor: col-resize / z-index 10(覆盖两侧 panel border)
 * - 双击重置默认宽(双击触发 onDoubleClick)
 * - drag 中通过 isDragging 把 line 强制保持显示
 *
 * 占位:absolute,父容器需 relative。位置由 side 决定:
 * - side=right(sidebar) → splitter 贴在 sidebar 右边缘,margin-left -6 居中
 * - side=left(panel)    → splitter 贴在 panel 左边缘,margin-left -6 居中
 */
export function PanelSplitter({
  side,
  isDragging,
  onMouseDown,
  onDoubleClick,
}: PanelSplitterProps) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      className={`group/sp absolute top-0 bottom-0 z-10 flex w-3 cursor-col-resize items-center justify-center ${
        side === "right" ? "right-0 -mr-1.5" : "left-0 -ml-1.5"
      }`}
    >
      <span
        className={`h-full rounded-full bg-brand transition-[width,background] duration-200 ease-(--ease-emphasized) ${
          isDragging ? "w-[3px]" : "w-0 group-hover/sp:w-[3px]"
        }`}
      />
    </div>
  );
}

/**
 * 拖拽中的全屏 overlay(z-9999 + cursor col-resize)— 防 iframe / canvas /
 * editor 区域 hover 抢 mousemove 事件,让 drag 平滑跨任何子树。
 *
 * 仅 isDragging=true 时挂载;父布局任意挂一处即可(通常在 chat-main 根)。
 */
export function DragOverlay() {
  return <div className="fixed inset-0 z-[9999] cursor-col-resize" />;
}
