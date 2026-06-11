import { useRef } from "react";
import WKSDK, { type Channel } from "wukongimjssdk";

interface SplitCache {
  channelKey: string;
  seq: number;
}

/**
 * "以上为历史消息" 分割线锚点 seq(issue #32):
 *
 * 进入会话时:若当前 conversation.unread > 0,锁定
 * `splitAfterSeq = lastMessage.messageSeq - unread`(即**最后已读消息的 seq**)。
 * message-list 渲染时遇到 messageSeq === splitAfterSeq 的消息 → 在该消息**之后**
 * 插入 `<HistoryDivider />`,视觉上自然形成"以上为历史,以下为新消息"分界。
 *
 * **跟老仓的差异**:老仓 vm.ts:1885 触发条件是 `messageSeq === initLocateMessageSeq`
 * — 只有 caller 显式传定位 seq(通知跳转到具体消息)才插分割线;普通点会话入口
 * 不传定位 → 不插。本仓改为更宽语义:任何 unread > 0 的会话入口都在"最后已读
 * 消息"后插,覆盖普通点未读群入口的主诉求(老仓 line 958 也算了同款 seq 作
 * `browseToMessageSeq`,只是没用来插分割线)。
 *
 * **render-time 计算 + useRef 缓存**(不用 useState/useEffect):
 *   - 同一 channel 期间锁定一次,后续 re-render 直接返回 ref 值
 *   - channel 切换时 channelKey 变 → 重读 conversation 取 unread 重算
 *
 * **为什么不用 useEffect**:useEffect 在 commit 阶段按声明顺序执行,跟同模块
 * 的 `useClearUnreadOnEnter` 抢顺序 — 后者 mount 时同步把 conv.unread=0,
 * 任何 useEffect 形态的 unread 读取都可能读到 0。render-time 同步读直接拿
 * SDK 当前 cache,跟 hook 调用顺序解耦。
 *
 * **返回 0**:unread=0 / conv 缺失 / lastMessage.messageSeq <= unread(等价
 * "全部消息都未读",此时分割线在列表头无意义)→ message-list 永不命中,不插。
 */
export function useHistorySplitAnchor(channel: Channel): number {
  const cacheRef = useRef<SplitCache>({ channelKey: "", seq: 0 });
  const channelKey = `${channel.channelID}_${channel.channelType}`;

  if (cacheRef.current.channelKey !== channelKey) {
    const conv = WKSDK.shared().conversationManager.findConversation(channel);
    let seq = 0;
    if (conv && conv.unread > 0 && conv.lastMessage) {
      const lastSeq = conv.lastMessage.messageSeq;
      if (lastSeq > conv.unread) seq = lastSeq - conv.unread;
    }
    cacheRef.current = { channelKey, seq };
  }

  return cacheRef.current.seq;
}
