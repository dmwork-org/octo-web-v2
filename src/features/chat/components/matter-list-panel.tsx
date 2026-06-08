import { useStore } from "@tanstack/react-store";
import { X } from "lucide-react";
import { chatSelectedStore } from "@/features/chat/stores/chat-selected";
import { chatSidePanelActions, chatSidePanelStore } from "@/features/chat/stores/chat-side-panel";
import { MatterList } from "@/features/matter/components/matter-list";
import { MatterDetailPanel as MatterDetailInner } from "@/features/matter/components/matter-detail-panel";
import { useRightPanelResize } from "@/features/chat/hooks/use-right-panel-resize.hook";
import { DragOverlay, PanelSplitter } from "@/components/ui/panel-splitter";
import { useT } from "@/lib/i18n/use-t";

/**
 * Chat 右侧 matter 面板(对齐旧 dmworkbase registerChatMatterPanel)。
 */
export function MatterListPanel() {
  const t = useT();
  const state = useStore(chatSidePanelStore, (s) => s);
  const channel = useStore(chatSelectedStore, (s) => s.channel);
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
              {t("matterListPanel.backToList")}
            </button>
          ) : (
            <h3 className="truncate text-sm font-semibold text-text-primary">
              {t("matterListPanel.title")}
            </h3>
          )}
        </div>
        <button
          type="button"
          onClick={() => chatSidePanelActions.close()}
          aria-label={t("matterListPanel.closeAria")}
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
