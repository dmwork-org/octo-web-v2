import { Suspense } from "react";
import { useStore } from "@tanstack/react-store";
import { X } from "lucide-react";
import { chatSelectedStore } from "@/features/chat/stores/chat-selected";
import {
  chatSidePanelActions,
  chatSidePanelStore,
  type RestorableSidePanelState,
} from "@/features/chat/stores/chat-side-panel";
import { MatterList } from "@/features/matter/components/matter-list";
import { MatterDetailPanel as MatterDetailInner } from "@/features/matter/components/matter-detail-panel";
import { useRightPanelResize } from "@/features/chat/hooks/use-right-panel-resize.hook";
import { DragOverlay, PanelSplitter } from "@/components/ui/panel-splitter";
import { useT } from "@/lib/i18n/use-t";

/**
 * Chat 右侧 matter 面板(对齐旧 dmworkbase registerChatMatterPanel)。
 */
interface MatterListPanelProps {
  stateOverride?: Extract<RestorableSidePanelState, { kind: "matter" }>;
  hidden?: boolean;
}

export function MatterListPanel({ stateOverride, hidden = false }: MatterListPanelProps = {}) {
  const t = useT();
  const liveState = useStore(chatSidePanelStore, (s) => s);
  const state = stateOverride ?? liveState;
  const channel = useStore(chatSelectedStore, (s) => s.channel);
  const { width, isDragging, panelRef, onSplitterMouseDown, onSplitterDoubleClick } =
    useRightPanelResize();
  if (state.kind !== "matter") return null;
  const { matterId } = state;

  return (
    <aside
      ref={panelRef}
      style={{ width }}
      className={`relative h-full shrink-0 flex-col border-l border-border-default bg-bg-base ${
        hidden ? "hidden" : "flex"
      }`}
    >
      {matterId ? (
        /* 详情态: MatterDetailPanel 自带 header (标题+状态+关闭按钮)。
           Suspense 边界只包详情内部,不卸载外层 <aside>(宽度容器)+ 拖拽手柄,
           fallback 撑满当前宽度,避免首次点开时面板"变窄→变宽"的闪烁。 */
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <Suspense
            fallback={
              <div className="flex h-full w-full items-center justify-center text-sm text-text-tertiary">
                {t("matter.state.loadingDetail")}
              </div>
            }
          >
            <MatterDetailInner
              matterId={matterId}
              onClose={() => chatSidePanelActions.selectMatter(null)}
              showClose
              sourceChannelId={channel?.channelID}
            />
          </Suspense>
        </div>
      ) : (
        /* 列表态: 外层 header + MatterList */
        <>
          <header className="flex h-12 shrink-0 items-center justify-between border-b border-border-subtle px-4">
            <h3 className="truncate text-sm font-semibold text-text-primary">
              {t("matterListPanel.title")}
            </h3>
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
            <MatterList
              selectedId={null}
              onSelect={(id) => chatSidePanelActions.selectMatter(id)}
              channel={channel ?? undefined}
            />
          </div>
        </>
      )}

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
