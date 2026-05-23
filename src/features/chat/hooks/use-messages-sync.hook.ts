import { useEffect } from "react";
import { useQueryClient, type InfiniteData } from "@tanstack/react-query";
import WKSDK, { type Channel, type Message } from "wukongimjssdk";
import { messagesQueryKey } from "@/features/chat/queries/messages.query";

/**
 * 订阅当前会话的新消息推送,append 到 InfiniteData.pages[0]。
 *
 * 实现:addMessageListener 拿到 Message,filter channel 相等,
 * setQueryData<InfiniteData<Message[], number>>(key)(prev => 把新消息追到第一页末尾)。
 * 不走 invalidate(那会重新拉一次第一页)。
 *
 * 去重跨页 by clientMsgNo:同一条消息在 server-acked 和 listener 都可能进。
 *
 * unmount / channel 切换时 remove listener。
 */
export function useMessagesSync(channel: Channel | null) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!channel) return;
    const key = messagesQueryKey(channel.channelID, channel.channelType);

    const listener = (message: Message) => {
      if (!message.channel.isEqual(channel)) return;
      qc.setQueryData<InfiniteData<Message[], number>>(key, (prev) => {
        if (!prev) {
          return { pages: [[message]], pageParams: [0] };
        }
        // 跨页去重:同 clientMsgNo 或 messageID 视为同一条
        for (const page of prev.pages) {
          if (page.some((m) => m.clientMsgNo === message.clientMsgNo)) return prev;
        }
        const firstPage = prev.pages[0] ?? [];
        return {
          ...prev,
          pages: [[...firstPage, message], ...prev.pages.slice(1)],
        };
      });
    };
    WKSDK.shared().chatManager.addMessageListener(listener);
    return () => {
      WKSDK.shared().chatManager.removeMessageListener(listener);
    };
  }, [channel, qc]);
}
