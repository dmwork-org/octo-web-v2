import { useEffect } from "react";
import { useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import WKSDK, {
  Channel,
  type CMDContent,
  ConnectStatus,
  type Message,
  MessageStatus,
  ReasonCode,
  type SendackPacket,
} from "wukongimjssdk";
import { spaceStore } from "@/features/base/stores/space";
import { isChannelOfSpace, isMessageOfSpace } from "@/features/base/lib/space-filter";
import { MessageContentTypeConst } from "@/features/base/im/content-types";
import { messagesQueryKey } from "@/features/chat/queries/messages.query";
import { TypingManager } from "@/features/chat/services/typing-manager";

/**
 * 订阅当前会话的:
 * - 新消息推送(messageListener)— append 到 InfiniteData.pages[0]
 * - 发送 ack(messageStatusListener)— 找 clientSeq 对应消息,更新 messageID/messageSeq/status
 *   (sendack 是 message.status 的唯一权威 — 对齐旧 dmworkbase/Components/Conversation/index.tsx
 *    `taskListener + ackListener` 双源 done 协议:task fail 仅影响该 send 操作的 retry 决策,
 *    不写 message.status;UI 层 image/file/video renderer 自行 subscribe task 显示进度 overlay)
 * - CMD messageRevoke / typing(chatManager.addCMDListener)
 * - WebSocket 重连(connectStatusListener)— Connected 时 invalidate 当前 channel
 *   的 messages query 补刷首屏(对齐上游 7a42c23a / #187):staleTime=Infinity 不会
 *   自动 refetch,断连期间 bot 回复经 HTTP sync 落库但当前会话拿不到,5s 去抖避免
 *   短间隔重连多次 invalidate
 *
 * 不走 invalidate(避免重新拉一次第一页)。channel 切换 / unmount 时移除 listener。
 *
 * **空间隔离双保险**:
 *   - hook 层:`isChannelOfSpace(channel, spaceId)` — channel 不属当前 Space 不挂 listener
 *   - listener 层:messageListener 内 `isMessageOfSpace` — Person 私聊
 *     (尤其 BotFather 这类全局 bot)按 message.content.contentObj.space_id 过滤
 *
 * **typing 联动**(对齐旧 dmworkbase TypingManager):
 *   - CMD `cmd: 'typing'` → TypingManager.addTyping(对齐旧 module.tsx:290)
 *   - bot 真消息到达 → TypingManager.removeTyping(对齐旧 module.tsx:433)
 *   - typing 消息(理论上走 CMD 不走 message listener)如果 server 误推普通 msg,
 *     skip 写 cache 避免被当历史消息保留
 */
export function useMessagesSync(channel: Channel | null) {
  const qc = useQueryClient();
  const spaceId = useStore(spaceStore, (s) => s.spaceId);

  useEffect(() => {
    if (!channel) return;
    // Space 隔离兜底:channel 不属当前 Space 不挂 listener(防 cache 跨 Space 渗漏)
    if (!isChannelOfSpace(channel, spaceId)) return;
    const key = messagesQueryKey(channel.channelID, channel.channelType);

    const updateInPlace = (predicate: (m: Message) => boolean, update: (m: Message) => void) => {
      qc.setQueryData<InfiniteData<Message[], number>>(key, (prev) => {
        if (!prev) return prev;
        let touched = false;
        for (const page of prev.pages) {
          for (const m of page) {
            if (predicate(m)) {
              update(m);
              touched = true;
            }
          }
        }
        if (!touched) return prev;
        // structuralSharing=false 已开,新数组引用即可触发重渲
        return { ...prev, pages: prev.pages.map((p) => [...p]) };
      });
    };

    const messageListener = (message: Message) => {
      if (!message.channel.isEqual(channel)) return;
      // typing 消息(理论上走 CMD,兜底):不写 cache
      if (message.contentType === MessageContentTypeConst.typing) return;
      // Person 私聊跨 Space 守门(BotFather 等全局 bot 看 contentObj.space_id)
      if (!isMessageOfSpace(message, spaceId)) return;
      // bot 真消息到达 → 清掉 typing indicator(对齐旧 module.tsx:433)
      if (TypingManager.hasTyping(message.channel)) {
        TypingManager.removeTyping(message.channel);
      }
      qc.setQueryData<InfiniteData<Message[], number>>(key, (prev) => {
        if (!prev) {
          return { pages: [[message]], pageParams: [0] };
        }
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

    const statusListener = (ack: SendackPacket) => {
      // ack.clientSeq 对应发送时分配的 clientSeq
      // ReasonCode.success = 1(SDK ReasonCode 枚举);0 = unknown,其他 = 各种失败
      updateInPlace(
        (m) => m.clientSeq === ack.clientSeq,
        (m) => {
          if (ack.reasonCode === ReasonCode.success) {
            m.messageID = ack.messageID.toString();
            m.messageSeq = ack.messageSeq;
            m.status = MessageStatus.Normal;
          } else {
            m.status = MessageStatus.Fail;
          }
        },
      );
    };

    const cmdListener = (cmdMessage: Message) => {
      const cmd = cmdMessage.content as CMDContent;

      // typing CMD(对齐旧 module.tsx:290):全局监听(channel 由 cmd.param 给,
      // 不一定 = 当前打开的 channel — 例如多面板未打开但 bot 已开始 typing)
      if (cmd.cmd === "typing") {
        const p = cmd.param as {
          channel_id?: string;
          channel_type?: number;
          from_uid?: string;
          from_name?: string;
        };
        if (p?.channel_id != null && p.channel_type != null && p.from_uid) {
          const typingChannel = new Channel(p.channel_id, p.channel_type);
          TypingManager.addTyping(typingChannel, p.from_uid, p.from_name ?? "");
        }
        return;
      }

      if (cmd.cmd !== "messageRevoke") return;
      const param = cmd.param as { message_id?: string };
      if (!param?.message_id) return;
      if (!cmdMessage.channel.isEqual(channel)) return;
      // 旧项目 module.tsx::cmdListener:撤回 CMD 推送时,fromUID 是撤回操作者
      updateInPlace(
        (m) => m.messageID === param.message_id,
        (m) => {
          m.remoteExtra.revoke = true;
          m.remoteExtra.revoker = cmdMessage.fromUID;
        },
      );
    };

    // 重连补刷当前会话首屏(对齐上游 7a42c23a / #187 第二层):
    // queryOptions staleTime=Infinity 不会自动 refetch,断连期间 bot 回复经
    // HTTP sync 落库但当前 InfiniteQuery 拿不到。5s 去抖避免短间隔重连多次刷。
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    const connectStatusListener = (status: ConnectStatus) => {
      if (status !== ConnectStatus.Connected) return;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => {
        void qc.invalidateQueries({ queryKey: key, refetchType: "active" });
      }, 5000);
    };

    WKSDK.shared().chatManager.addMessageListener(messageListener);
    WKSDK.shared().chatManager.addMessageStatusListener(statusListener);
    WKSDK.shared().chatManager.addCMDListener(cmdListener);
    WKSDK.shared().connectManager.addConnectStatusListener(connectStatusListener);
    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      WKSDK.shared().chatManager.removeMessageListener(messageListener);
      WKSDK.shared().chatManager.removeMessageStatusListener(statusListener);
      WKSDK.shared().chatManager.removeCMDListener(cmdListener);
      WKSDK.shared().connectManager.removeConnectStatusListener(connectStatusListener);
    };
  }, [channel, qc, spaceId]);
}
