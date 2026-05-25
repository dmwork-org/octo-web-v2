import { Store } from "@tanstack/react-store";
import type { Message } from "wukongimjssdk";
import { chatSelectedStore } from "@/features/chat/stores/chat-selected";

/**
 * 回复上下文 store(对应旧 ConversationVM.currentReplyMessage):
 *
 * - replyingTo:用户右键"回复"选中的源消息;Composer 顶部显示 quoted bar
 * - 发送时 MessageText.reply = new Reply(messageID/messageSeq/fromUID/fromName/content)
 *   (chat-callbacks 的 chatManager.send 自动把 reply 序列化到 payload)
 *
 * Channel 切换时自动清(切到其他对话不带旧 reply 上下文)。
 */

interface ChatReplyState {
  replyingTo: Message | null;
}

export const chatReplyStore = new Store<ChatReplyState>({ replyingTo: null });

export const chatReplyActions = {
  set: (message: Message) => chatReplyStore.setState(() => ({ replyingTo: message })),
  clear: () => chatReplyStore.setState(() => ({ replyingTo: null })),
};

/**
 * 跨 store 联动:切换会话时清掉 reply 上下文。
 * main.tsx 启动时调一次。
 */
export function wireChatReplyResetOnChannelChange(): void {
  let lastChannelId = chatSelectedStore.state.channel?.channelID ?? null;
  chatSelectedStore.subscribe(() => {
    const next = chatSelectedStore.state.channel?.channelID ?? null;
    if (next === lastChannelId) return;
    lastChannelId = next;
    chatReplyActions.clear();
  });
}
