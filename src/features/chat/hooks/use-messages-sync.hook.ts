import { useEffect } from "react";
import { useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import WKSDK, {
  Channel,
  ChannelTypePerson,
  type CMDContent,
  ConnectStatus,
  type Message,
  MessageStatus,
  PullMode,
  ReasonCode,
  type SendackPacket,
} from "wukongimjssdk";
import { spaceStore } from "@/features/base/stores/space";
import { isMessageOfSpace } from "@/features/base/lib/space-filter";
import { messagesQueryKey } from "@/features/chat/queries/messages.query";
import { TypingManager } from "@/features/chat/services/typing-manager";
import {
  isCacheableChatMessage,
  isSameMessageIdentity,
} from "@/features/chat/lib/message-identity";

export const SYNC_DEDUP_MS = 30_000;

const lastSyncByChannel = new Map<string, number>();

interface SyncGapMessage {
  messageSeq?: number | null;
}

function newestCachedMessageSeq(pages: SyncGapMessage[][]): number {
  let newest = 0;
  for (const page of pages) {
    for (const message of page) {
      const seq = message.messageSeq ?? 0;
      if (seq > newest) newest = seq;
    }
  }
  return newest;
}

export function shouldSyncMessagesOnEnter(args: {
  pages: SyncGapMessage[][];
  latestMessageSeq: number;
  now: number;
  lastSyncAt: number;
}): boolean {
  if (args.pages.length === 0) return false;
  if (args.latestMessageSeq > newestCachedMessageSeq(args.pages)) return true;
  return args.now - args.lastSyncAt > SYNC_DEDUP_MS;
}

/**
 * 订阅当前会话的:
 * 当前会话不要在 hook 入口用 `isChannelOfSpace` fail-close:群聊的
 * channelSpaceMap / channelInfo 可能在首次打开时尚未回填,会导致 SDK
 * `send()` 立即触发的本地 messageListener 和后续 ack 都没订阅到,表现为
 * "发送后不刷新,切换会话回来才补差"。
 *
 * **typing 联动**(对齐旧 dmworkbase TypingManager):
 *   - CMD `cmd: 'typing'` → TypingManager.addTyping(对齐旧 module.tsx:290)
 *   - bot 真消息到达 → TypingManager.removeTyping(对齐旧 module.tsx:433)
 *   - typing / time / historySplit 这类 UI marker 如果进入 listener,
 *     skip 写 cache 避免顶掉真实消息
 */
export function useMessagesSync(channel: Channel | null) {
  const qc = useQueryClient();
  const spaceId = useStore(spaceStore, (s) => s.spaceId);

  useEffect(() => {
    if (!channel) return;
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
      // typing/time/historySplit 是 UI marker,不进入真实消息 cache。
      if (!isCacheableChatMessage(message)) return;
      // Person 私聊跨 Space 守门(BotFather 等全局 bot 看 contentObj.space_id);
      // Group/Thread 不二次守:当前 MessageList 已绑定选中会话;在 listener 内
      // 重复 isChannelOfSpace 风险是 channelSpaceMap / channelInfo 还没填充时
      // fail-close 静默丢消息,导致主面板看不到新消息但 sidebar 能看到。
      if (
        message.channel.channelType === ChannelTypePerson &&
        !isMessageOfSpace(message, spaceId)
      ) {
        return;
      }
      // bot 真消息到达 → 清掉 typing indicator(对齐旧 module.tsx:433)
      if (TypingManager.hasTyping(message.channel)) {
        TypingManager.removeTyping(message.channel);
      }
      qc.setQueryData<InfiniteData<Message[], number>>(key, (prev) => {
        if (!prev) {
          return { pages: [[message]], pageParams: [0] };
        }
        for (const page of prev.pages) {
          if (page.some((m) => isSameMessageIdentity(m, message))) return prev;
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

      // messageRevoke 由全局 use-cmd-sync 处理:它不依赖当前 channel 是否打开,
      // 同时更新 message cache 与 conversation lastMessage,保证 recent 列表摘要同步。
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

    // 进入 channel 时主动补差(对齐老仓 "打开会话即 syncMessages"):
    // messagesInfiniteQueryOptions staleTime=Infinity 让 cache 不会自动 refetch。
    // 若上次离开本会话期间有新消息(bot 回复 / 别人发言),messageListener 只对
    // **当前** mounted channel 生效,B 没打开时根本没人写它的 cache。点回 B 时
    // useInfiniteQuery 看到 cache 命中直接用旧数据 → 新消息看不到。
    //
    // 修法:进入(且 cache 已有数据)时主动 SDK syncMessages 拉最新一页,
    // append 到 firstPage 末尾,渲染时按 messageSeq 排序自动排到底部。
    // 去重靠 clientMsgNo,与 messageListener 同模式。
    //
    // **去重**(issue #216 + #222):若 conversation latest seq 已超过本地 cache,
    // 即使 30s 内也必须补差;否则才用时间窗限流,避免切走切回反复打后端。
    const prevData = qc.getQueryData<InfiniteData<Message[], number>>(key);
    const channelKey = `${channel.channelType}::${channel.channelID}`;
    const lastSyncAt = lastSyncByChannel.get(channelKey) ?? 0;
    const latestMessageSeq =
      WKSDK.shared().conversationManager.findConversation(channel)?.lastMessage?.messageSeq ?? 0;
    const now = Date.now();
    if (
      prevData &&
      shouldSyncMessagesOnEnter({
        pages: prevData.pages,
        latestMessageSeq,
        now,
        lastSyncAt,
      })
    ) {
      lastSyncByChannel.set(channelKey, now);
      void (async () => {
        try {
          const latest = await WKSDK.shared().chatManager.syncMessages(channel, {
            startMessageSeq: 0,
            endMessageSeq: 0,
            limit: 30,
            pullMode: PullMode.Down,
          });
          if (!latest || latest.length === 0) return;
          qc.setQueryData<InfiniteData<Message[], number>>(key, (prev) => {
            if (!prev || prev.pages.length === 0) return prev;
            const firstPage = prev.pages[0];
            const existing = prev.pages.flat();
            const newOnes = latest
              .filter(isCacheableChatMessage)
              .filter((m) => !existing.some((old) => isSameMessageIdentity(old, m)));
            if (newOnes.length === 0) return prev;
            return {
              ...prev,
              pages: [[...firstPage, ...newOnes], ...prev.pages.slice(1)],
            };
          });
        } catch {
          // 静默失败 — messageListener 实时推送 + reconnect 5s invalidate 仍是兜底
        }
      })();
    }

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      WKSDK.shared().chatManager.removeMessageListener(messageListener);
      WKSDK.shared().chatManager.removeMessageStatusListener(statusListener);
      WKSDK.shared().chatManager.removeCMDListener(cmdListener);
      WKSDK.shared().connectManager.removeConnectStatusListener(connectStatusListener);
    };
  }, [channel, qc, spaceId]);
}
