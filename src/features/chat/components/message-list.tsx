import { useEffect, useMemo, useRef } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { type Channel, type Message } from "wukongimjssdk";
import { messagesInfiniteQueryOptions } from "@/features/chat/queries/messages.query";
import { useMessagesSync } from "@/features/chat/hooks/use-messages-sync.hook";
import { useClearUnreadOnEnter } from "@/features/chat/hooks/use-clear-unread.hook";
import { MessageRow } from "@/features/chat/components/message-row";
import { TimeDivider } from "@/features/chat/components/time-divider";

interface MessageListProps {
  channel: Channel;
}

/** 列表更新后自动滚到底(仅当用户已在底部附近) — 拉旧不滚。 */
function useScrollToBottomOnNewMessages(
  messages: Message[],
  scrollRef: React.RefObject<HTMLDivElement | null>,
) {
  const lastLengthRef = useRef(0);
  const lastIdRef = useRef<string>("");
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const lastMsg = messages[messages.length - 1];
    const lastId = lastMsg ? lastMsg.clientMsgNo || lastMsg.messageID : "";
    const isAppend = messages.length > lastLengthRef.current && lastId !== lastIdRef.current;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
    if (isAppend && isNearBottom) {
      el.scrollTop = el.scrollHeight;
    }
    if (lastLengthRef.current === 0 && messages.length > 0) {
      el.scrollTop = el.scrollHeight;
    }
    lastLengthRef.current = messages.length;
    lastIdRef.current = lastId;
  }, [messages, scrollRef]);
}

/** 顶部 sentinel 进入视口时触发 fetchNextPage(拉旧)。 */
function useLoadMoreOnTopReached(
  sentinelRef: React.RefObject<HTMLDivElement | null>,
  enabled: boolean,
  onLoadMore: () => void,
) {
  useEffect(() => {
    if (!enabled) return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) onLoadMore();
        }
      },
      { rootMargin: "100px 0px 0px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [sentinelRef, enabled, onLoadMore]);
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
  // 跨日(本地时区)
  const a = new Date((prev.timestamp || 0) * 1000);
  const b = new Date((curr.timestamp || 0) * 1000);
  if (a.toDateString() !== b.toDateString()) return true;
  return false;
}

export function MessageList({ channel }: MessageListProps) {
  useMessagesSync(channel);
  useClearUnreadOnEnter(channel);
  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery(messagesInfiniteQueryOptions(channel));

  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const messages = useMemo(() => {
    const all = (data?.pages ?? []).flat();
    return [...all].sort((a, b) => {
      const aSeq = a.messageSeq || Number.MAX_SAFE_INTEGER;
      const bSeq = b.messageSeq || Number.MAX_SAFE_INTEGER;
      return aSeq - bSeq;
    });
  }, [data?.pages]);

  useScrollToBottomOnNewMessages(messages, scrollRef);
  useLoadMoreOnTopReached(sentinelRef, !!hasNextPage && !isFetchingNextPage, () => {
    void fetchNextPage();
  });

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
      <div ref={sentinelRef} className="h-1" aria-hidden />
      {hasNextPage && (
        <div className="flex justify-center py-2 text-xs text-text-tertiary">
          {isFetchingNextPage ? "加载更早消息…" : "上拉加载更多"}
        </div>
      )}
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
