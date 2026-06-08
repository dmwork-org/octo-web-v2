import { Store } from "@tanstack/react-store";
import { t } from "@/lib/i18n/instance";

/**
 * 全局 chat 域 confirm dialog store(对齐旧 dmworkbase WKModal +
 * Pages/Chat `pendingConfirm: { onOk } | null` 模式)。
 *
 * 当前唯一消费场景:`chatSelectedActions.select` 检测到未发送附件 → show()
 *   → 用户点继续切 onOk 真切;取消 hide()。
 *
 * 之后可承载其他确认场景(放弃录音 / 退出未保存编辑等),共用一个 modal slot。
 */

export interface ChatConfirmDialogState {
  open: boolean;
  title: string;
  message: string;
  okText: string;
  cancelText: string;
  onOk: (() => void) | null;
}

function buildInitialState(): ChatConfirmDialogState {
  return {
    open: false,
    title: "",
    message: "",
    okText: t("chatConfirmDialog.ok"),
    cancelText: t("chatConfirmDialog.cancel"),
    onOk: null,
  };
}

export const chatConfirmDialogStore = new Store<ChatConfirmDialogState>(buildInitialState());

interface ShowOptions {
  title: string;
  message: string;
  okText?: string;
  cancelText?: string;
  onOk: () => void;
}

export const chatConfirmDialogActions = {
  show(opts: ShowOptions): void {
    chatConfirmDialogStore.setState(() => ({
      open: true,
      title: opts.title,
      message: opts.message,
      okText: opts.okText ?? t("chatConfirmDialog.continue"),
      cancelText: opts.cancelText ?? t("chatConfirmDialog.cancel"),
      onOk: opts.onOk,
    }));
  },
  hide(): void {
    chatConfirmDialogStore.setState(() => buildInitialState());
  },
  confirm(): void {
    const { onOk } = chatConfirmDialogStore.state;
    chatConfirmDialogStore.setState(() => buildInitialState());
    onOk?.();
  },
};
