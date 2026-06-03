import { useStore } from "@tanstack/react-store";
import {
  chatConfirmDialogActions,
  chatConfirmDialogStore,
} from "@/features/chat/stores/chat-confirm-dialog";

/**
 * 全局 chat 域 confirm dialog 渲染层 — 挂在 chat.view 根部一次。
 *
 * 当前唯一触发路径:切换 channel 时检测到未发送附件
 * (`chatSelectedActions.select` → `chatConfirmDialogActions.show`)。
 *
 * 设计:
 * - z-[80](高于 friend-add 的 70,避免被 modal 盖住)
 * - 点遮罩 = 取消(与老仓 WKModal closable:false 不同,新仓允许点外取消,
 *   单纯切会话不是破坏性操作,体验更顺)
 * - Esc 暂未绑(后续如需统一绑,与全局 hotkey 一起处理)
 */
export function ChatConfirmDialog() {
  const state = useStore(chatConfirmDialogStore, (s) => s);
  if (!state.open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
      onClick={chatConfirmDialogActions.hide}
    >
      <div
        className="flex w-full max-w-sm flex-col gap-4 rounded-lg border border-border-default bg-bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-text-primary">{state.title}</h2>
        <p className="text-sm leading-relaxed text-text-secondary">{state.message}</p>
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={chatConfirmDialogActions.hide}
            className="rounded-md px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
          >
            {state.cancelText}
          </button>
          <button
            type="button"
            onClick={chatConfirmDialogActions.confirm}
            className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand/90"
          >
            {state.okText}
          </button>
        </div>
      </div>
    </div>
  );
}
