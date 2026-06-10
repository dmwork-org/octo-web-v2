import { useStore } from "@tanstack/react-store";
import { ChevronLeft, X } from "lucide-react";
import { chatSelectedStore } from "@/features/chat/stores/chat-selected";
import { chatSidePanelActions, chatSidePanelStore } from "@/features/chat/stores/chat-side-panel";
import { useRightPanelResize } from "@/features/chat/hooks/use-right-panel-resize.hook";
import { DragOverlay, PanelSplitter } from "@/components/ui/panel-splitter";
import { useT } from "@/lib/i18n/use-t";
import { ChatSummaryHistory } from "@/features/summary/components/chat-summary-history";
import { SummaryDetail } from "@/features/summary/components/summary-detail";

/**
 * Chat 右侧"智能总结" panel(对齐老仓 ChatSummaryPanel,本仓壳子复用 thread/matter
 * 同款 useRightPanelResize + PanelSplitter,内容 list / detail 用 chatSidePanelStore
 * 的 taskId 决定)。
 *
 * - taskId === null:渲染 ChatSummaryHistory(当前会话的总结历史 + 新建入口)
 * - taskId !== null:渲染 SummaryDetail(整页详情复用主模块组件,带返回 ← 按钮)
 *
 * 触发新建总结:交给 ChatMain 的聊天级 modal 统一处理;成功后强制打开列表并由
 * chat-summary-created event 驱动刷新,避免把用户从聊天上下文切出去。
 */
export function ChatSummaryPanel({ onCreateNew }: { onCreateNew: () => void }) {
  const t = useT();
  const state = useStore(chatSidePanelStore, (s) => s);
  const channel = useStore(chatSelectedStore, (s) => s.channel);
  const { width, isDragging, panelRef, onSplitterMouseDown, onSplitterDoubleClick } =
    useRightPanelResize();

  if (state.kind !== "summary" || !channel) return null;
  const { taskId } = state;

  return (
    <aside
      ref={panelRef}
      style={{ width }}
      className="relative flex h-full shrink-0 flex-col border-l border-border-default bg-bg-base"
    >
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border-subtle px-4">
        <div className="flex min-w-0 items-center gap-2">
          {taskId != null ? (
            <button
              type="button"
              onClick={() => chatSidePanelActions.selectSummary(null)}
              className="flex items-center gap-1 text-[13px] text-text-tertiary hover:text-text-secondary"
            >
              <ChevronLeft size={14} />
              {t("summary.chatSummary.back")}
            </button>
          ) : (
            <h3 className="truncate text-sm font-semibold text-text-primary">
              {t("summary.chatSummary.panelTitle")}
            </h3>
          )}
        </div>
        <button
          type="button"
          onClick={() => chatSidePanelActions.close()}
          aria-label={t("summary.chatSummary.closeAria")}
          className="flex h-6 w-6 items-center justify-center text-text-tertiary hover:text-text-secondary"
        >
          <X size={16} />
        </button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {taskId != null ? (
          <SummaryDetail
            taskId={taskId}
            onDeleted={() => chatSidePanelActions.selectSummary(null)}
          />
        ) : (
          <ChatSummaryHistory
            channel={channel}
            onSelect={(id) => chatSidePanelActions.selectSummary(id)}
            onCreateNew={onCreateNew}
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
