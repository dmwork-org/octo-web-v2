import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import WKSDK, { type ChannelInfo, type Conversation, type ConversationAction } from "wukongimjssdk";
import { spaceStore } from "@/features/base/stores/space";
import { conversationsQueryKey } from "@/features/chat/queries/conversations.query";

/**
 * 订阅 SDK conversation + channelInfo 推送,把变化写回 query cache。
 *
 * 实现方式:listener 触发后 **不** invalidate(那会重新 sync 一次网络),而是直接读
 * SDK 内部维护的 `conversationManager.conversations` 数组的当前快照(SDK 已自持
 * 增量数据),写回 query cache,React Query 自动通知订阅者重渲。
 *
 * 两个 listener 都触发 cache 重写:
 *   - conversationListener: 新会话 / 删除 / unread 更新
 *   - channelInfoListener:  channelInfo.title 异步拉到后让列表显示真名
 *                           (Conversation.channelInfo 是 getter,从 channelManager 取)
 *
 * **spaceId 绑定**:setQueryData 时用当前 spaceId 拼 key,与 ConversationList useQuery
 * 拼的 key 必须一致;Space 切换时 useEffect deps 变更重挂 listener。
 *
 * 必须在 IMProvider mount 之后挂(对应 `_auth` 子树,SDK 已 connect)。
 */
export function useConversationsSync() {
  const qc = useQueryClient();
  const spaceId = useStore(spaceStore, (s) => s.spaceId);

  useEffect(() => {
    const writeSnapshot = () => {
      const snapshot = [...WKSDK.shared().conversationManager.conversations];
      qc.setQueryData(conversationsQueryKey(spaceId), snapshot);
    };

    const convListener = (_conversation: Conversation, _action: ConversationAction) => {
      writeSnapshot();
    };
    const channelInfoListener = (_info: ChannelInfo) => {
      // channelInfo 更新时,会话列表的 title 跟着变;重写 snapshot 触发重渲
      writeSnapshot();
    };

    WKSDK.shared().conversationManager.addConversationListener(convListener);
    WKSDK.shared().channelManager.addListener(channelInfoListener);
    return () => {
      WKSDK.shared().conversationManager.removeConversationListener(convListener);
      WKSDK.shared().channelManager.removeListener(channelInfoListener);
    };
  }, [qc, spaceId]);
}
