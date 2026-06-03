import { useStore } from "@tanstack/react-store";
import { X } from "lucide-react";
import { chatSelectedStore } from "@/features/chat/stores/chat-selected";
import { chatSidePanelActions, chatSidePanelStore } from "@/features/chat/stores/chat-side-panel";
import { MatterList } from "@/features/matter/components/matter-list";
import { MatterDetailPanel as MatterDetailInner } from "@/features/matter/components/matter-detail-panel";
import { useRightPanelResize } from "@/features/chat/hooks/use-right-panel-resize.hook";
import { DragOverlay, PanelSplitter } from "@/components/ui/panel-splitter";

/**
 * Chat 右侧 matter 面板(对齐旧 dmworkbase registerChatMatterPanel)。
 *
 * 与 ThreadListPanel / FilePreviewPanel 同形态 + **共享同款拖拽 hook**
 * (useRightPanelResize → wk-thread-panel-width localStorage 联动:
 * 三个 panel 切换 width 不变,跟老仓 ThreadPanel 共用同一组件同款行为),
 * 由 chatSidePanelStore.kind === "matter" 触发渲染。
 *
 * 内部双栈导航:
 *   matterId === null  → 列表(MatterList)
 *   matterId !== null  → 详情(MatterDetailInner),返回上一层 selectMatter(null)
 *
 * close 走 chatSidePanelActions.close()(对齐旧 _onCloseMatterPanel)。
 */
export function MatterListPanel() {
  const state = useStore(chatSidePanelStore, (s) => s);
  // chat 当前 channel — 传给 MatterList,触发"按 channel_id 过滤 + 默认 tab=all + 本地切 tab"
  // (对齐旧 ChatMatterPanel { initialFilters: { channel_id }, default tab="all" })
  const channel = useStore(chatSelectedStore, (s) => s.channel);
  // 宽度拖拽(左边缘,共享 thread/file localStorage 联动)
  const { width, isDragging, panelRef, onSplitterMouseDown, onSplitterDoubleClick } =
    useRightPanelResize();
  if (state.kind !== "matter") return null;
  const { matterId } = state;

  return (
    <aside
      ref={panelRef}
      style={{ width }}
      className="relative flex h-full shrink-0 flex-col border-l border-border-default bg-bg-base"
    >
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border-subtle px-4">
        <div className="flex min-w-0 items-center gap-2">
          {matterId ? (
            <button
              type="button"
              onClick={() => chatSidePanelActions.selectMatter(null)}
              className="text-[13px] text-text-tertiary hover:text-text-secondary"
            >
              ‹ 返回事项列表
            </button>
          ) : (
            <h3 className="truncate text-sm font-semibold text-text-primary">事项</h3>
          )}
        </div>
        <button
          type="button"
          onClick={() => chatSidePanelActions.close()}
          aria-label="关闭事项面板"
          className="flex h-6 w-6 items-center justify-center text-text-tertiary hover:text-text-secondary"
        >
          <X size={16} />
        </button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {matterId ? (
          <MatterDetailInner
            matterId={matterId}
            onClose={() => chatSidePanelActions.selectMatter(null)}
          />
        ) : (
          <MatterList
            selectedId={null}
            onSelect={(id) => chatSidePanelActions.selectMatter(id)}
            channel={channel ?? undefined}
          />
        )}
      </div>

      {/* 左边缘 splitter:hover/drag 显紫色细线;双击重置默认 432 */}
      <PanelSplitter
        side="left"
        isDragging={isDragging}
        onMouseDown={onSplitterMouseDown}
        onDoubleClick={onSplitterDoubleClick}
      />
      {isDragging ? <DragOverlay /> : null}
    </aside>
  );
}
