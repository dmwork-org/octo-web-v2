import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { distanceFromBottom } from "@/features/chat/lib/history-scroll";

/** 距底部多少算"在底部"(对齐 message-list 的 NEAR_BOTTOM_THRESHOLD)。 */
const NEAR_BOTTOM_THRESHOLD = 200;

/**
 * 消息列表右下角 scroll-to-bottom 按钮 + 未读徽标 state hook
 * (1:1 对齐旧 dmworkbase ConversationPositionView + vm.showScrollToBottomBtn / unreadCount):
 *
 * **可见**:scrollTop > lastMessageHeight+20 → 显示;在底部 → 隐藏。
 *   新仓简化 — 距底部 ≥ 200px → 显示按钮。
 *
 * **未读计数**(简化版):
 *   - baseline = "用户最近一次在底部时" 的 messageCount
 *   - unreadCount = max(messageCount - baseline, 0)
 *   - 滚到底部 / 点按钮 / 自己发消息 → baseline = messageCount(清 unread)
 *   - 不在底部时新消息进来 → unreadCount 自动 +1
 *
 *   未走旧仓 messageSeq diff(`lastMessage.messageSeq - browseToMessageSeq`),
 *   原因:browseToMessageSeq 需要逐条消息 viewport 可见性检测,实现成本高;
 *   baseline diff 在新仓单会话场景已足够准确。
 *
 * **初始 baseline**:首条消息到位时(messageCount: 0 → >0)同步到 messageCount,
 *   避免初次进入会话时按钮显示 unread = total messages 的 bug。
 *
 * **myUid 自己消息**:自己发出会触发 useFollowBottomOnNewMessages 强制滚到底,
 *   滚动 listener 触发 atBottom → baseline 同步,本 hook 不用单独处理 self message。
 */
export function useScrollToBottomButton(
  scrollRef: React.RefObject<HTMLDivElement | null>,
  messageCount: number,
): {
  visible: boolean;
  unreadCount: number;
  scrollToBottom: () => void;
} {
  const [atBottom, setAtBottom] = useState(true);
  const [baseline, setBaseline] = useState(0);
  // ref:scroll listener 闭包始终读最新 messageCount,避免每次 messageCount 变重 attach
  const messageCountRef = useRef(messageCount);
  messageCountRef.current = messageCount;
  const initRef = useRef(false);

  // 首条消息到位 → baseline = 当前 messageCount(避免 unread 误报为 total)
  useLayoutEffect(() => {
    if (initRef.current) return;
    if (messageCount > 0) {
      setBaseline(messageCount);
      initRef.current = true;
    }
  }, [messageCount]);

  // 关键:effect deps 必须含 `ready` 而非仅 scrollRef(ref 引用稳定不触发重跑)。
  // message-list 在 messages.length===0/loading/error 时 early-return 不渲染 scroll 容器,
  // scrollRef.current = null,effect 跑了也 attach 不上;等 messages 到位 ready
  // 从 false→true,effect 重跑此时才能 attach listener。
  const ready = messageCount > 0;
  useEffect(() => {
    if (!ready) return;
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const near = distanceFromBottom(el) < NEAR_BOTTOM_THRESHOLD;
      setAtBottom(near);
      if (near) setBaseline(messageCountRef.current);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [scrollRef, ready]);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setBaseline(messageCountRef.current);
  }, [scrollRef]);

  const unreadCount = Math.max(0, messageCount - baseline);
  return { visible: !atBottom, unreadCount, scrollToBottom };
}
