import { useEffect } from "react";
import { useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import WKSDK, {
  Channel,
  type CMDContent,
  type Message,
  MessageStatus,
  type SendackPacket,
  type Task,
  TaskStatus,
} from "wukongimjssdk";
import { spaceStore } from "@/features/base/stores/space";
import { isChannelOfSpace, isMessageOfSpace } from "@/features/base/lib/space-filter";
import { MessageContentTypeConst } from "@/features/base/im/content-types";
import { messagesQueryKey } from "@/features/chat/queries/messages.query";
import { TypingManager } from "@/features/chat/services/typing-manager";

/** Task 实例可能是 MessageTask 子类(.message 字段);用类型 intersection 让 cast 通过。 */
type TaskWithMessage = Task & { message?: Message };

/**
 * 订阅当前会话的:
 * - 新消息推送(messageListener)— append 到 InfiniteData.pages[0]
 * - 发送 ack(messageStatusListener)— 找 clientSeq 对应消息,更新 messageID/messageSeq/status
 * - 上传任务失败(taskManager.addListener)— 把 sendingQueue 内对应消息标 Fail
 * - CMD messageRevoke / typing(chatManager.addCMDListener)
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
      // ack.clientSeq 对应发送时分配的 clientSeq;reasonCode 0 成功,非 0 失败
      updateInPlace(
        (m) => m.clientSeq === ack.clientSeq,
        (m) => {
          if (ack.reasonCode === 0) {
            m.messageID = ack.messageID.toString();
            m.messageSeq = ack.messageSeq;
            m.status = MessageStatus.Normal;
          } else {
            m.status = MessageStatus.Fail;
          }
        },
      );
    };

    const taskListener = (task: Task) => {
      if (task.status !== TaskStatus.fail && task.status !== TaskStatus.cancel) return;
      const taskMsg = (task as TaskWithMessage).message;
      if (!taskMsg) return;
      if (!taskMsg.channel.isEqual(channel)) return;
      updateInPlace(
        (m) => m.clientMsgNo === taskMsg.clientMsgNo,
        (m) => {
          m.status = MessageStatus.Fail;
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

    WKSDK.shared().chatManager.addMessageListener(messageListener);
    WKSDK.shared().chatManager.addMessageStatusListener(statusListener);
    WKSDK.shared().chatManager.addCMDListener(cmdListener);
    WKSDK.shared().taskManager.addListener(taskListener);
    return () => {
      WKSDK.shared().chatManager.removeMessageListener(messageListener);
      WKSDK.shared().chatManager.removeMessageStatusListener(statusListener);
      WKSDK.shared().chatManager.removeCMDListener(cmdListener);
      WKSDK.shared().taskManager.removeListener(taskListener);
    };
  }, [channel, qc, spaceId]);
}
