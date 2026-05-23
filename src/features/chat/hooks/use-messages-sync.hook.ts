import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import WKSDK, { type Channel, type Message } from "wukongimjssdk";
import { messagesQueryKey } from "@/features/chat/queries/messages.query";

/**
 * 订阅当前会话的新消息推送,append 到 query cache。
 *
 * 实现:addMessageListener 拿到 Message,filter channel 相等,
 * setQueryData([..., channelType, channelID])(prev => [...prev, message])。
 * 不走 invalidate(避免重复网络拉取)。
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
      qc.setQueryData<Message[]>(key, (prev) => {
        if (!prev) return [message];
        // 去重:同 clientMsgNo 或 messageID 视为同一条
        if (prev.some((m) => m.clientMsgNo === message.clientMsgNo)) return prev;
        return [...prev, message];
      });
    };
    WKSDK.shared().chatManager.addMessageListener(listener);
    return () => {
      WKSDK.shared().chatManager.removeMessageListener(listener);
    };
  }, [channel, qc]);
}
