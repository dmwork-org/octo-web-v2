import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { distanceFromBottom } from "@/features/chat/lib/history-scroll";

/** 距底部多少算"在底部"(对齐 message-list 的 NEAR_BOTTOM_THRESHOLD)。 */
const NEAR_BOTTOM_THRESHOLD = 200;

/**
 * 消息列表右下角 scroll-to-bottom 按钮 + 未读徽标 state hook
 * (对齐旧 dmworkbase Conversation/vm.ts refreshNewMsgCount 语义)。
 *
 * **可见**:距底部 ≥ NEAR_BOTTOM_THRESHOLD(200px)→ 显示按钮。
 *
 * **未读计数**(issue #31 修复):
 *   - 入参 `tailKey` = 末尾消息的稳定 id(clientMsgNo / messageID),**只有末尾消息
 *     变化才视作"有新消息进来"**;**isOwnTail** = 末尾是自己发的
 *   - baseline:用户最近一次在底部时记下的 `tailKey`(快照)
 *   - 不在底部 + tailKey 跟 baseline 不同 + 末尾不是自己发 → unread +1
 *   - 在底部 / scrollToBottom() / 末尾换成自己发的 → 重置 baseline + unread=0
 *
 *   **原 bug**:用 `messages.length` 作 diff 基础,`fetchNextPage` 把历史插到头部
 *   也会让 messages.length 增加 → 向上滚加载历史时被误判为"新消息"显未读徽标。
 *   现改用末尾稳定 id,加载历史时 tail 不变 → unread 不动。
 *
 *   未走老仓精确 `messageSeq - baselineSeq` 计数(老仓真实 unread 数字):
 *   本仓简化为"每条 +1",pending message seq=0 也算,99+ 时显示 99+。
 *
 * **myUid 自己消息**:useFollowBottomOnNewMessages 会强制滚到底,但末尾换为
 *   自己时本 hook 主动同步 baseline + 清 unread,防止 follow-bottom 触发 scroll
 *   listener 之前的窗口期残留 unread。
 */
export function useScrollToBottomButton(
  scrollRef: React.RefObject<HTMLDivElement | null>,
  tailKey: string,
  isOwnTail: boolean,
): {
  visible: boolean;
  unreadCount: number;
  scrollToBottom: () => void;
} {
  const [atBottom, setAtBottom] = useState(true);
  const [baselineTailKey, setBaselineTailKey] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const initRef = useRef(false);
  // ref:scroll listener 闭包始终读最新 tailKey,避免 listener 每次 tailKey 变重 attach
  const tailKeyRef = useRef(tailKey);
  tailKeyRef.current = tailKey;
  const atBottomRef = useRef(atBottom);
  atBottomRef.current = atBottom;
  const suppressNextUnreadRef = useRef(false);

  // 首条消息到位 → baseline 直接对齐当前 tail,unread=0(避免首屏误报)
  useLayoutEffect(() => {
    if (initRef.current) return;
    if (tailKey) {
      setBaselineTailKey(tailKey);
      setUnreadCount(0);
      initRef.current = true;
    }
  }, [tailKey]);

  // tailKey 变化(末尾消息更新):在底部或自己发 → 同步 baseline 清零;不在底部
  // 且末尾不是自己 → unread +1
  useEffect(() => {
    if (!initRef.current || !tailKey) return;
    if (tailKey === baselineTailKey) return;
    if (atBottomRef.current || isOwnTail || suppressNextUnreadRef.current) {
      suppressNextUnreadRef.current = false;
      setBaselineTailKey(tailKey);
      setUnreadCount(0);
    } else {
      setUnreadCount((c) => c + 1);
    }
    // baselineTailKey 不进 deps:在底部时 setBaselineTailKey 触发本 effect 重跑
    // 会进入 tail === baseline 分支自然 noop,但避免重算 +1。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tailKey, isOwnTail]);

  // 关键:effect deps 必须含 `ready` 而非仅 scrollRef(ref 引用稳定不触发重跑)。
  // message-list 在 messages.length===0/loading/error 时 early-return 不渲染 scroll 容器,
  // scrollRef.current = null,effect 跑了也 attach 不上;等 messages 到位 ready
  // 从 false→true,effect 重跑此时才能 attach listener。
  const ready = !!tailKey;
  useEffect(() => {
    if (!ready) return;
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const near = distanceFromBottom(el) < NEAR_BOTTOM_THRESHOLD;
      setAtBottom(near);
      if (near) {
        setBaselineTailKey(tailKeyRef.current);
        setUnreadCount(0);
      }
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [scrollRef, ready]);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    suppressNextUnreadRef.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setAtBottom(true);
    setBaselineTailKey(tailKeyRef.current);
    setUnreadCount(0);
  }, [scrollRef]);

  return { visible: !atBottom, unreadCount, scrollToBottom };
}
