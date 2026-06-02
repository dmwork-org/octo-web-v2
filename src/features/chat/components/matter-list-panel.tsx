import { useStore } from "@tanstack/react-store";
import { X } from "lucide-react";
import { chatSidePanelActions, chatSidePanelStore } from "@/features/chat/stores/chat-side-panel";
import { MatterList } from "@/features/matter/components/matter-list";
import { MatterDetailPanel as MatterDetailInner } from "@/features/matter/components/matter-detail-panel";

/**
 * Chat 右侧 matter 面板(对齐旧 dmworkbase registerChatMatterPanel)。
 *
 * 与 ThreadListPanel / FilePreviewPanel 同形态:380px 横向 flex sibling,
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
  if (state.kind !== "matter") return null;
  const { matterId } = state;

  return (
    <aside className="flex h-full w-[380px] shrink-0 flex-col border-l border-border-default bg-bg-base">
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
          <MatterList selectedId={null} onSelect={(id) => chatSidePanelActions.selectMatter(id)} />
        )}
      </div>
    </aside>
  );
}
