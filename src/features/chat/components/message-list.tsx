import { useEffect, useMemo, useRef } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { type Channel, type Message, MessageContentType } from "wukongimjssdk";
import { messagesInfiniteQueryOptions } from "@/features/chat/queries/messages.query";
import { useMessagesSync } from "@/features/chat/hooks/use-messages-sync.hook";
import { TextRenderer } from "@/features/chat/message-renderers/text-renderer";

interface MessageListProps {
  channel: Channel;
}

function MessageRow({ message }: { message: Message }) {
  switch (message.contentType) {
    case MessageContentType.text:
      return <TextRenderer message={message} />;
    default:
      // P2-B3 / B4 / B5 / 系统类未覆盖前,占位避免渲染崩
      return (
        <div className="flex justify-center">
          <span className="rounded bg-bg-elevated px-2 py-1 text-[11px] text-text-tertiary">
            [不支持的消息类型 {message.contentType}]
          </span>
        </div>
      );
  }
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
    // 首次加载强制到底
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

export function MessageList({ channel }: MessageListProps) {
  useMessagesSync(channel);
  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery(messagesInfiniteQueryOptions(channel));

  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // 把所有页 flat 后按 messageSeq 升序(顶部最旧,底部最新);
  // messageSeq=0 的新发送中消息追到末尾(它们 server-acked 后会拿到 seq)。
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
    <div ref={scrollRef} className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
      <div ref={sentinelRef} className="h-1" aria-hidden />
      {hasNextPage && (
        <div className="flex justify-center py-2 text-xs text-text-tertiary">
          {isFetchingNextPage ? "加载更早消息…" : "上拉加载更多"}
        </div>
      )}
      {messages.map((m) => (
        <MessageRow key={m.clientMsgNo || m.messageID} message={m} />
      ))}
    </div>
  );
}
