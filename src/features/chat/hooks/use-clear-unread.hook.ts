import { useEffect } from "react";
import WKSDK, { type Channel, type Conversation, ConversationAction } from "wukongimjssdk";
import { clearConversationUnread } from "@/features/base/api/endpoints/conversation.api";

/**
 * 进入会话视图时清空未读(对应旧 Conversation/vm.ts 进入会话时 markConversationUnread)。
 *
 * - 调 PUT /v1/conversation/clearUnread
 * - 本地立即把 SDK Conversation.unread 置 0 并 notify(会话列表 badge 即时消失)
 * - channel 切换时重新调
 *
 * **持续监听 listener 模式**(对齐老仓 Conversation/vm.ts conversationListener):
 * mount 时若 conv 还不存在(如新建群,SDK 还没 push add)直接 return 就漏了 —
 * 后端 push add 带 unread=1(系统"群创建成功"消息)时本地不会再清,徽标卡住。
 * 改为:mount 时试一次 + 注册 conversationListener,SDK 任何 push 命中当前 channel
 * 都重试 ack。
 *
 * 失败静默(已读上报不阻塞用户操作)。
 */
export function useClearUnreadOnEnter(channel: Channel | null) {
  useEffect(() => {
    if (!channel) return;

    const ack = () => {
      const conv = WKSDK.shared().conversationManager.findConversation(channel);
      if (!conv || conv.unread <= 0) return;

      const prevUnread = conv.unread;
      conv.unread = 0;
      WKSDK.shared().conversationManager.notifyConversationListeners(
        conv,
        ConversationAction.update,
      );

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
    };

    // mount 时立即试一次(已存在 conv 走这条)
    ack();

    // 持续监听:SDK push add / update 命中当前 channel 时再 ack(新建群场景靠这条)
    const cm = WKSDK.shared().conversationManager;
    const listener = (c: Conversation, _action: ConversationAction) => {
      if (c.channel.isEqual(channel)) ack();
    };
    cm.addConversationListener(listener);
    return () => cm.removeConversationListener(listener);
  }, [channel]);
}
