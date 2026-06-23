import { infiniteQueryOptions } from "@tanstack/react-query";
import WKSDK, { type Channel, type Message, PullMode } from "wukongimjssdk";

const PAGE_LIMIT = 30;

/**
 * 单会话历史消息 — 无限滚动 query。
 *
 * 数据源:SDK `chatManager.syncMessages(channel, opts)` → 走 syncMessagesCallback
 * (POST message/channel/sync,见 features/base/providers/im-callbacks.ts)。
 *
 * 分页约定(对照旧项目 Conversation/vm.ts):
 * - `pageParam = 0` 第一页:startSeq=0 pullMode=Down → 后端理解为"从无穷大向下拉 N 条"= 最新 N 条
 * - 后续翻旧:startSeq=当前最旧 messageSeq - 1, pullMode=Down → 更老的 N 条
 * - getNextPageParam:lastPage.length < limit 则没更老消息(返回 undefined)
 *
 * **SYSTEM_BOTS(BotFather)特殊处理(issue #161)**:
 * syncMessagesCallback 对 SYSTEM_BOTS 跳过 X-Space-Id header,后端返回跨 Space
 * 全量消息。message-list display 层用 isMessageOfSpace 做客户端过滤,只展示
 * 当前 Space 消息。getNextPageParam 基于未过滤全量数据计算 cursor,分页不受影响。
 *
 * 显示侧:`pages.flat()` 后由 message-list 做 Space 过滤 + 按 timestamp 升序排,
 * 顶部最旧 / 底部最新。实时新消息由 `useMessagesSync` 写到 `pages[0]` 末尾(去重
 * by clientMsgNo)。
 */

export const messagesQueryKey = (channelId: string, channelType: number) =>
  ["chat", "messages", channelType, channelId] as const;

export const messagesInfiniteQueryOptions = (channel: Channel) =>
  infiniteQueryOptions({
    queryKey: messagesQueryKey(channel.channelID, channel.channelType),
    initialPageParam: 0 as number,
    queryFn: async ({ pageParam }): Promise<Message[]> => {
      const list = await WKSDK.shared().chatManager.syncMessages(channel, {
        startMessageSeq: pageParam,
        endMessageSeq: 0,
        limit: PAGE_LIMIT,
        pullMode: PullMode.Down,
      });
      return list ?? [];
    },
    getNextPageParam: (lastPage): number | undefined => {
      if (lastPage.length < PAGE_LIMIT) return undefined;
      // 找到当前页中最小的正数 messageSeq(跳过 seq=0 的 pending/cmd 消息)。
      // 用 oldest=0 作为"未找到"哨兵:全页 seq=0 时无法分页(后端未分配序号)。
      let oldest = 0;
      for (const m of lastPage) {
        if (m.messageSeq > 0 && (oldest === 0 || m.messageSeq < oldest)) {
          oldest = m.messageSeq;
        }
      }
      // oldest=0 → 无法分页;oldest=1 → 已到最早消息
      return oldest > 1 ? oldest - 1 : undefined;
    },
    staleTime: Number.POSITIVE_INFINITY,
    // 同 conversations:Message 是 SDK mutable 实例,getter 跨 cache 取值;
    // listener 写新 snapshot 时需要触发 re-render,禁掉 structuralSharing。
    structuralSharing: false,
  });
