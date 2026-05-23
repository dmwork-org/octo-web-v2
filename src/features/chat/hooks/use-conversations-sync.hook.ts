import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import WKSDK, { type Conversation, type ConversationAction } from "wukongimjssdk";
import { conversationsQueryKey } from "@/features/chat/queries/conversations.query";

/**
 * 订阅 SDK conversation 推送,把变化写回 query cache。
 *
 * 实现方式:listener 触发后 **不** invalidate(那会重新 sync 一次网络),而是直接读
 * SDK 内部维护的 `conversationManager.conversations` 数组的当前快照(SDK 已自持
 * 增量数据),写回 query cache,React Query 自动通知订阅者重渲。
 *
 * 必须在 IMProvider mount 之后挂(对应 `_auth` 子树,SDK 已 connect)。
 * unmount 时移除 listener。
 */
export function useConversationsSync() {
  const qc = useQueryClient();

  useEffect(() => {
    const listener = (_conversation: Conversation, _action: ConversationAction) => {
      const snapshot = [...WKSDK.shared().conversationManager.conversations];
      qc.setQueryData(conversationsQueryKey, snapshot);
    };
    WKSDK.shared().conversationManager.addConversationListener(listener);
    return () => {
      WKSDK.shared().conversationManager.removeConversationListener(listener);
    };
  }, [qc]);
}
