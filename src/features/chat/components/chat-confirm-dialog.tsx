import { useStore } from "@tanstack/react-store";
import { ConfirmDialog } from "@/features/base/components/overlay/confirm-dialog";
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
 * 浮动元素壳层统一规范 Phase C2 — 走 ConfirmDialog,默认 z-dialog (300),
 * 高于 popover (200),不冲突。
 */
export function ChatConfirmDialog() {
  const state = useStore(chatConfirmDialogStore, (s) => s);
  return (
    <ConfirmDialog
      open={state.open}
      title={state.title}
      content={state.message}
      okText={state.okText}
      cancelText={state.cancelText}
      onOk={() => chatConfirmDialogActions.confirm()}
      onCancel={() => chatConfirmDialogActions.hide()}
      onOpenChange={(next) => {
        if (!next) chatConfirmDialogActions.hide();
      }}
    />
  );
}
