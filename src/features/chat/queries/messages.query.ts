import { queryOptions } from "@tanstack/react-query";
import WKSDK, { type Channel, type Message, PullMode } from "wukongimjssdk";

const PAGE_LIMIT = 30;

/**
 * 单会话历史消息 query。
 *
 * 数据源:`chatManager.syncMessages(channel, { startMessageSeq:0, limit, pullMode: Down })`
 * 拉最新 30 条(SDK 内部按需走本地缓存 / 服务器拉取)。
 *
 * P2-A3 第一版:只拉一页,不支持无限滚动(P3 再加 useInfiniteQuery)。
 * 实时新增消息由 `useMessagesSync` 通过 listener 写回 cache。
 */

export const messagesQueryKey = (channelId: string, channelType: number) =>
  ["chat", "messages", channelType, channelId] as const;

export const messagesQueryOptions = (channel: Channel) =>
  queryOptions({
    queryKey: messagesQueryKey(channel.channelID, channel.channelType),
    queryFn: async (): Promise<Message[]> => {
      const list = await WKSDK.shared().chatManager.syncMessages(channel, {
        startMessageSeq: 0,
        endMessageSeq: 0,
        limit: PAGE_LIMIT,
        pullMode: PullMode.Down,
      });
      return list ?? [];
    },
    staleTime: Number.POSITIVE_INFINITY,
  });
