import { Store } from "@tanstack/react-store";
import type { Channel } from "wukongimjssdk";
import { spaceStore } from "@/features/base/stores/space";
import { chatPendingAttachmentRegistry } from "@/features/chat/stores/chat-pending-attachment";
import { chatConfirmDialogActions } from "@/features/chat/stores/chat-confirm-dialog";
import { t } from "@/lib/i18n/instance";

/**
 * 全局当前选中的 chat channel。
 *
 * 设计:
 * - chat / contacts(以及未来 matter / summary 凡需展示聊天主区) 共用一个
 *   ChatMain 组件,由这个 store 驱动当前显示哪个会话。
 * - sidebar 切换会话 / 联系人详情点击 → chatSelectedActions.select(channel)
 * - chatSelectedActions.clear() — 进入"无选中"占位状态
 *
 * 不持久化(刷新页面后丢失选中);P3 后续如有需要再加 storage。
 *
 * **未发送附件守卫**(对齐旧 dmworkbase Pages/Chat `pendingAttachmentGuard` 模式):
 * - `select` 内部检查 [chat-pending-attachment.ts](./chat-pending-attachment.ts)
 *   注册的 guard,有未发送附件时 → 改走 confirm dialog(`chatConfirmDialogActions.show`)
 *   确认后才真切;取消则 channel 不变。
 * - 同 channel 重选(channelID + type 一致)直接跳过 guard,不弹 modal。
 * - clear(Space 切换 / 退出登录)不走 guard:Space 已变,旧 channel 已无意义,
 *   不应阻塞用户(对齐旧 ChatVM.spaceChangedHandler 强清行为)。
 */

interface ChatSelectedState {
  channel: Channel | null;
}

export const chatSelectedStore = new Store<ChatSelectedState>({ channel: null });

function isSameChannel(a: Channel | null, b: Channel): boolean {
  return !!a && a.channelID === b.channelID && a.channelType === b.channelType;
}

function doSelect(channel: Channel): void {
  chatSelectedStore.setState(() => ({ channel }));
}

export const chatSelectedActions = {
  select: (channel: Channel) => {
    if (isSameChannel(chatSelectedStore.state.channel, channel)) return;
    if (chatPendingAttachmentRegistry.hasPending()) {
      chatConfirmDialogActions.show({
        title: t("chatSelected.pendingAttachment.title"),
        message: t("chatSelected.pendingAttachment.message"),
        okText: t("chatSelected.pendingAttachment.ok"),
        onOk: () => doSelect(channel),
      });
      return;
    }
    doSelect(channel);
  },
  clear: () => chatSelectedStore.setState(() => ({ channel: null })),
};

/**
 * 跨 store 联动:Space 切换时清掉选中(对齐旧 ChatVM.spaceChangedHandler:
 * `this.selectedConversation = undefined`)。
 *
 * 旧 channel 大概率不属于新 Space,继续显示会让 Composer 发到错的 Space。
 * main.tsx 启动时调一次。
 */
export function wireChatSelectedResetOnSpaceChange(): void {
  let lastSpaceId = spaceStore.state.spaceId;
  spaceStore.subscribe(() => {
    const next = spaceStore.state.spaceId;
    if (next === lastSpaceId) return;
    lastSpaceId = next;
    chatSelectedActions.clear();
  });
}
