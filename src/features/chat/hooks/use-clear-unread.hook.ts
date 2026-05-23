import { useEffect } from "react";
import WKSDK, { type Channel, ConversationAction } from "wukongimjssdk";
import { clearConversationUnread } from "@/features/base/api/endpoints/conversation.api";

/**
 * 进入会话视图时清空未读(对应旧 Conversation/vm.ts 进入会话时 markConversationUnread)。
 *
 * - 调 PUT /v1/conversation/clearUnread
 * - 本地立即把 SDK Conversation.unread 置 0 并 notify(会话列表 badge 即时消失)
 * - channel 切换时重新调
 *
 * 失败静默(已读上报不阻塞用户操作)。
 */
export function useClearUnreadOnEnter(channel: Channel | null) {
  useEffect(() => {
    if (!channel) return;
    const conv = WKSDK.shared().conversationManager.findConversation(channel);
    if (!conv || conv.unread <= 0) return;

    const prevUnread = conv.unread;
    conv.unread = 0;
    WKSDK.shared().conversationManager.notifyConversationListeners(conv, ConversationAction.update);

    void clearConversationUnread({
      channelId: channel.channelID,
      channelType: channel.channelType,
      unread: 0,
    }).catch(() => {
      // 失败回滚 unread(下次 syncConversations 会自我修正,无需手动)
      conv.unread = prevUnread;
      WKSDK.shared().conversationManager.notifyConversationListeners(
        conv,
        ConversationAction.update,
      );
    });
  }, [channel]);
}
