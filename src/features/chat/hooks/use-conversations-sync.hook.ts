import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import WKSDK, { type ChannelInfo, type Conversation, type ConversationAction } from "wukongimjssdk";
import { spaceStore } from "@/features/base/stores/space";
import { isChannelOfSpace } from "@/features/base/lib/space-filter";
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
 * **空间隔离**:SDK conversationManager.conversations 是全局共享的,IM 推送来的会话
 * 属于哪个 space 跟当前 spaceStore 无关 — 会有"切 Space A 但 B 的新消息蹦出来在 A
 * 列表"的渗漏。writeSnapshot 用 `isChannelOfSpace` 过滤,3 层判定:
 *   channelSpaceMap → SDK channelInfo.orgData.space_id 回填 → fail-open
 * (对齐旧 dmworkbase Service/SpaceService.shouldSkipChannelForSpace)。
 *
 * 旧版仅查 channelSpaceMap 不 fallback channelInfo,导致 channelInfo 已 cache 但
 * channelSpaceMap 未预填的 case(channelInfoListener 早于 syncConversations 到位)
 * 漏过滤 — 本次修复为根因。
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
      const all = WKSDK.shared().conversationManager.conversations;
      const filtered = spaceId ? all.filter((c) => isChannelOfSpace(c.channel, spaceId)) : [...all];
      qc.setQueryData(conversationsQueryKey(spaceId), filtered);
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
