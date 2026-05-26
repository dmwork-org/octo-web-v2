import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { type Channel, type Message } from "wukongimjssdk";
import { messagesInfiniteQueryOptions } from "@/features/chat/queries/messages.query";
import { useMessagesSync } from "@/features/chat/hooks/use-messages-sync.hook";
import { useClearUnreadOnEnter } from "@/features/chat/hooks/use-clear-unread.hook";
import { MessageRow } from "@/features/chat/components/message-row";
import { TimeDivider } from "@/features/chat/components/time-divider";
import {
  distanceFromBottom,
  getPulldownRestoredScrollTop,
  isNearTopForHistory,
} from "@/features/chat/lib/history-scroll";

interface MessageListProps {
  channel: Channel;
}

/** 系统消息 / 撤回消息 不渲染头像 + sender。 */
function shouldRenderBare(m: Message): boolean {
  if (m.remoteExtra?.revoke) return true;
  const ct = m.contentType;
  if (ct >= 1000 && ct <= 2000) return true;
  return false;
}

const CONTINUE_GAP_SEC = 5 * 60;
const TIME_DIVIDER_GAP_SEC = 5 * 60;
/** 用户离底部多远还算"在底部",收到新消息时自动跟到底。 */
const NEAR_BOTTOM_THRESHOLD = 200;

/** 与上一条同发送者 + 5 分钟内 = 连续(对应旧 wk-msg-row--continue)。 */
function isContinue(curr: Message, prev: Message | undefined): boolean {
  if (!prev) return false;
  if (shouldRenderBare(prev) || shouldRenderBare(curr)) return false;
  if (prev.fromUID !== curr.fromUID) return false;
  return Math.abs((curr.timestamp || 0) - (prev.timestamp || 0)) < CONTINUE_GAP_SEC;
}

/** 跨 5 分钟 / 跨日 → 在当前消息前插入 TimeDivider。 */
function shouldInsertDivider(curr: Message, prev: Message | undefined): boolean {
  if (!prev) return true;
  const gap = Math.abs((curr.timestamp || 0) - (prev.timestamp || 0));
  if (gap >= TIME_DIVIDER_GAP_SEC) return true;
  const a = new Date((prev.timestamp || 0) * 1000);
  const b = new Date((curr.timestamp || 0) * 1000);
  if (a.toDateString() !== b.toDateString()) return true;
  return false;
}

/**
 * 进入会话时把 scrollTop 拉到底(useLayoutEffect 在 paint 前同步设置,避免闪烁)。
 *
 * 触发条件:`firstReadyKey` 从 "" 变成第一条非空消息的 id 时,认为是初次到达 +
 * 内容首次有 height — 这一帧把 scrollTop 设到底,后续不再干预(由"新消息到达
 * 时,若用户在底部附近就自动跟"接管)。
 */
function useInitialScrollToBottom(
  scrollRef: React.RefObject<HTMLDivElement | null>,
  firstReadyKey: string,
) {
  const initRef = useRef("");
  useLayoutEffect(() => {
    if (!firstReadyKey) return;
    if (initRef.current === firstReadyKey) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    initRef.current = firstReadyKey;
  }, [firstReadyKey, scrollRef]);
}

/**
 * 新消息到达时:如果用户在底部附近就自动跟到底,否则不动(用户可能在看历史,
 * 强行跳底体验差;旧版有"返回最新"按钮,本期暂不补)。
 *
 * 触发器:lastMessage id 变化(append) + 当前位置离底部 < NEAR_BOTTOM_THRESHOLD。
 */
function useFollowBottomOnNewMessages(
  scrollRef: React.RefObject<HTMLDivElement | null>,
  lastMessageKey: string,
) {
  const lastIdRef = useRef("");
  useEffect(() => {
    if (!lastMessageKey || lastIdRef.current === lastMessageKey) return;
    const el = scrollRef.current;
    if (el && distanceFromBottom(el) < NEAR_BOTTOM_THRESHOLD) {
      el.scrollTop = el.scrollHeight;
    }
    lastIdRef.current = lastMessageKey;
  }, [lastMessageKey, scrollRef]);
}

/**
 * 顶部 onScroll 触发拉历史 + prepend 后保持视觉位置。
 *
 * - onScroll:scrollTop <= 250 → fetchNextPage(loading 时不重复触发,
 *   isFetchingNextPage / fetchedSinceMountRef 双锁定)
 * - prepend 完成那一帧:scrollTop = prevScrollTop + (nextHeight - prevHeight)
 *   用 useLayoutEffect 在 paint 前同步设置,无闪烁
 *
 * 实现:在 fetchNextPage 调用前 snapshot prev,调用后 useLayoutEffect 监听
 * pageCount 变化时还原。
 */
function usePulldownToLoadHistory(
  scrollRef: React.RefObject<HTMLDivElement | null>,
  pageCount: number,
  hasNextPage: boolean,
  isFetchingNextPage: boolean,
  fetchNextPage: () => void,
) {
  // snapshot 容器:fetchNextPage 调用瞬间记录 scrollHeight + scrollTop
  const snapshotRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
  // 上一次见到的 pageCount,用来判定 prepend 是否完成
  const prevPageCountRef = useRef(pageCount);

  // onScroll 监听:接近顶部 → 取 snapshot 后触发 fetchNextPage
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      if (!hasNextPage || isFetchingNextPage) return;
      if (!isNearTopForHistory(el.scrollTop)) return;
      snapshotRef.current = { scrollHeight: el.scrollHeight, scrollTop: el.scrollTop };
      fetchNextPage();
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [scrollRef, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // prepend 完成(pageCount 增加 + snapshot 在手)→ 还原 scrollTop
  useLayoutEffect(() => {
    if (pageCount <= prevPageCountRef.current) {
      prevPageCountRef.current = pageCount;
      return;
    }
    const el = scrollRef.current;
    const snap = snapshotRef.current;
    if (el && snap) {
      el.scrollTop = getPulldownRestoredScrollTop({
        previousScrollHeight: snap.scrollHeight,
        previousScrollTop: snap.scrollTop,
        nextScrollHeight: el.scrollHeight,
      });
      snapshotRef.current = null;
    }
    prevPageCountRef.current = pageCount;
  }, [pageCount, scrollRef]);
}

export function MessageList({ channel }: MessageListProps) {
  useMessagesSync(channel);
  useClearUnreadOnEnter(channel);
  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery(messagesInfiniteQueryOptions(channel));

  const scrollRef = useRef<HTMLDivElement>(null);

  const messages = useMemo(() => {
    const all = (data?.pages ?? []).flat();
    return [...all].sort((a, b) => {
      const aSeq = a.messageSeq || Number.MAX_SAFE_INTEGER;
      const bSeq = b.messageSeq || Number.MAX_SAFE_INTEGER;
      return aSeq - bSeq;
    });
  }, [data?.pages]);

  const firstReadyKey = useMemo(
    () => (messages[0] ? messages[0].clientMsgNo || messages[0].messageID || "" : ""),
    [messages],
  );
  const lastMessageKey = useMemo(() => {
    const last = messages[messages.length - 1];
    return last ? last.clientMsgNo || last.messageID || "" : "";
  }, [messages]);

  useInitialScrollToBottom(scrollRef, firstReadyKey);
  useFollowBottomOnNewMessages(scrollRef, lastMessageKey);
  usePulldownToLoadHistory(
    scrollRef,
    data?.pages.length ?? 0,
    !!hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  );

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
        加载消息…
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-error">消息加载失败</div>
    );
  }
  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
        暂无消息,发一条试试
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="flex flex-1 flex-col overflow-y-auto py-3">
      {hasNextPage ? (
        <div className="flex justify-center py-2 text-xs text-text-tertiary">
          {isFetchingNextPage ? "加载更早消息…" : "上拉到顶部加载更多"}
        </div>
      ) : messages.length > 0 ? (
        <div className="flex justify-center py-2 text-xs text-text-tertiary">没有更早的消息了</div>
      ) : null}
      {messages.map((m, i) => {
        const prev = messages[i - 1];
        const bare = shouldRenderBare(m);
        const continueWithPrev = !bare && isContinue(m, prev);
        const showDivider = shouldInsertDivider(m, prev);
        return (
          <div key={m.clientMsgNo || m.messageID}>
            {showDivider && <TimeDivider timestamp={m.timestamp} />}
            <MessageRow message={m} bare={bare} continueWithPrev={continueWithPrev} />
          </div>
        );
      })}
    </div>
  );
}
