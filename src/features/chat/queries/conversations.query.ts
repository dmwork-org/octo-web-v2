import { queryOptions } from "@tanstack/react-query";
import WKSDK, { type Conversation } from "wukongimjssdk";

/**
 * 会话列表 query。
 *
 * 数据源:`WKSDK.shared().conversationManager.sync(filter)` — 拉服务器最新 +
 * 填 SDK 内部缓存(`sdk.conversationManager.conversations`)。
 *
 * 后续 SDK 推送(`addConversationListener`)由 `useConversationsSync` 把变化
 * `setQueryData` 写回这个 key,触发 React 重渲。不走 invalidate(避免额外网络请求,
 * 因为 SDK 已自持增量数据)。
 *
 * staleTime: Infinity — 进入 chat 视图首次拉一次,之后全靠 SDK 推送维持新鲜度。
 */

export const conversationsQueryKey = ["chat", "conversations"] as const;

export const conversationsQueryOptions = () =>
  queryOptions({
    queryKey: conversationsQueryKey,
    queryFn: async (): Promise<Conversation[]> => {
      const list = await WKSDK.shared().conversationManager.sync({});
      return list ?? [];
    },
    staleTime: Number.POSITIVE_INFINITY,
    // 关键:Conversation 是 SDK 内部 mutable 实例,channelInfo / lastMessage 是 getter 跨 cache
    // 取值。React Query 默认 structuralSharing deep-equal,会判定 [...prev] 和原 array 深度相等
    // 而返回旧引用 — 我们 setQueryData(snapshot) 触发不了重渲。禁掉 structural sharing 让
    // 每次写都视为"数据变了",listener 推送的 channelInfo / lastMessage 变化才能反映到 UI。
    structuralSharing: false,
  });
