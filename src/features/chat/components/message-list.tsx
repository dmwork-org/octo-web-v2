import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import { type Channel, type Message } from "wukongimjssdk";
import { authStore } from "@/features/base/stores/auth";
import { MessageContentTypeConst } from "@/features/base/im/content-types";
import { messagesInfiniteQueryOptions } from "@/features/chat/queries/messages.query";
import { useMessagesSync } from "@/features/chat/hooks/use-messages-sync.hook";
import { useClearUnreadOnEnter } from "@/features/chat/hooks/use-clear-unread.hook";
import { useChannelInfoTick } from "@/features/chat/hooks/use-channel-info-tick.hook";
import { useScrollToBottomButton } from "@/features/chat/hooks/use-scroll-to-bottom-button.hook";
import { MessageRow } from "@/features/chat/components/message-row";
import { TimeDivider } from "@/features/chat/components/time-divider";
import { FoldSessionCard } from "@/features/chat/components/fold-session-card";
import { ScrollToBottomButton } from "@/features/chat/components/scroll-to-bottom-button";
import { buildRenderItems } from "@/features/chat/lib/fold-session";
import {
  distanceFromBottom,
  getPulldownRestoredScrollTop,
  isNearTopForHistory,
} from "@/features/chat/lib/history-scroll";

interface MessageListProps {
  channel: Channel;
}

/**
 * 系统消息 / 撤回消息 不渲染头像 + sender。
 *
 * 例外:threadCreated(1100,在 system 范围内)有真实创建人 — 走完整 MessageRow
 * 显示头像 + sender,卡片本身就是 thread renderer。其他 system contentType
 * (addMembers/removeMembers/channelUpdate/...)继续 bare。
 */
function shouldRenderBare(m: Message): boolean {
  if (m.remoteExtra?.revoke) return true;
  const ct = m.contentType;
  if (ct === MessageContentTypeConst.threadCreated) return false;
  if (ct >= 1000 && ct <= 2000) return true;
  return false;
}

/** 用户离底部多远还算"在底部",收到新消息时自动跟到底。 */
const NEAR_BOTTOM_THRESHOLD = 200;

/**
 * 同发送者 = 连续(对齐旧 dmworkbase useMessageRow.ts:86 isContinue):
 *   pre 存在 + 非系统(bare)消息 + 同 sender
 * **不**做时间窗口判断 — 即使跨多小时,同一发送者连发的消息全聚合一个 header。
 */
function isContinue(curr: Message, prev: Message | undefined): boolean {
  if (!prev) return false;
  if (shouldRenderBare(prev) || shouldRenderBare(curr)) return false;
  return prev.fromUID === curr.fromUID;
}

/**
 * **只**跨日时插入 TimeDivider("MM月DD日" 胶囊),一天内多条消息不再重复分隔。
 * 精确时间显示在每条消息 header 里(message-row),对齐旧 dmworkbase vm.ts:1756。
 *
 * 取每个 RenderItem 的代表 timestamp:foldSession 用 lastMessage,message 用自身。
 */
function timestampOfItem(item: ReturnType<typeof buildRenderItems>[number]): number {
  return item.type === "foldSession" ? item.session.lastMessage.timestamp : item.message.timestamp;
}

function shouldInsertDividerByTs(currTs: number, prevTs: number | undefined): boolean {
  if (prevTs === undefined) return true;
  const a = new Date((prevTs || 0) * 1000);
  const b = new Date((currTs || 0) * 1000);
  return a.toDateString() !== b.toDateString();
}

/**
 * 进入会话时把 scrollTop 拉到底(useLayoutEffect 在 paint 前同步设置,避免闪烁)。
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

interface FollowBottomKey {
  /** 末条消息的稳定 id(clientMsgNo / messageID) */
  id: string;
  /** 是否自己发出 */
  mine: boolean;
}

function useFollowBottomOnNewMessages(
  scrollRef: React.RefObject<HTMLDivElement | null>,
  key: FollowBottomKey,
) {
  const lastIdRef = useRef("");
  useLayoutEffect(() => {
    if (!key.id || lastIdRef.current === key.id) return;
    const el = scrollRef.current;
    if (!el) {
      lastIdRef.current = key.id;
      return;
    }
    const shouldFollow = key.mine || distanceFromBottom(el) < NEAR_BOTTOM_THRESHOLD;
    if (shouldFollow) {
      el.scrollTop = el.scrollHeight;
      requestAnimationFrame(() => {
        if (el.isConnected) el.scrollTop = el.scrollHeight;
      });
    }
    lastIdRef.current = key.id;
  }, [key.id, key.mine, scrollRef]);
}

function usePulldownToLoadHistory(
  scrollRef: React.RefObject<HTMLDivElement | null>,
  pageCount: number,
  hasNextPage: boolean,
  isFetchingNextPage: boolean,
  fetchNextPage: () => void,
) {
  const snapshotRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
  const prevPageCountRef = useRef(pageCount);

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
  const myUid = useStore(authStore, (s) => s.user?.uid ?? "");
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

  // 计算 renderItems:连续 ≥2 条 bot 消息聚合成 foldSession,其他普通 message。
  // 加 channelInfoTick 依赖 — channelInfo 异步到位后 isBotMessage 重算,
  // 解决首屏 channelInfo 未缓存 → bot 判定 false → 永远不聚合 bug
  // (对齐旧 vm channelInfoListener 触发 rebuildRenderItems)。
  const channelInfoTick = useChannelInfoTick();
  const renderItems = useMemo(
    () => buildRenderItems(messages),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [messages, channelInfoTick],
  );

  // fold session 展开收起 state(sessionId → boolean,默认折叠)
  const [expandedSessions, setExpandedSessions] = useState<Map<string, boolean>>(new Map());
  const toggleSession = (sessionId: string) => {
    setExpandedSessions((prev) => {
      const next = new Map(prev);
      next.set(sessionId, !next.get(sessionId));
      return next;
    });
  };

  const firstReadyKey = useMemo(
    () => (messages[0] ? messages[0].clientMsgNo || messages[0].messageID || "" : ""),
    [messages],
  );
  const followKey = useMemo<FollowBottomKey>(() => {
    const last = messages[messages.length - 1];
    if (!last) return { id: "", mine: false };
    return {
      id: last.clientMsgNo || last.messageID || "",
      mine: !!myUid && last.fromUID === myUid,
    };
  }, [messages, myUid]);

  useInitialScrollToBottom(scrollRef, firstReadyKey);
  useFollowBottomOnNewMessages(scrollRef, followKey);
  usePulldownToLoadHistory(
    scrollRef,
    data?.pages.length ?? 0,
    !!hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  );

  // 右下角 scroll-to-bottom 按钮 + 未读徽标(1:1 对齐旧 ConversationPositionView)
  const scrollBtn = useScrollToBottomButton(scrollRef, messages.length);

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
    <div className="relative flex min-h-0 flex-1 flex-col" style={{ backgroundColor: "#f6f6f6" }}>
      <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-3">
        {hasNextPage ? (
          <div className="flex justify-center py-2 text-xs text-text-tertiary">
            {isFetchingNextPage ? "加载更早消息…" : "上拉到顶部加载更多"}
          </div>
        ) : null}
        {renderItems.map((item, i) => {
          const prev = renderItems[i - 1];
          const currTs = timestampOfItem(item);
          const prevTs = prev ? timestampOfItem(prev) : undefined;
          const showDivider = shouldInsertDividerByTs(currTs, prevTs);

          if (item.type === "foldSession") {
            const session = item.session;
            return (
              <div key={session.sessionId}>
                {showDivider ? <TimeDivider timestamp={currTs} /> : null}
                <FoldSessionCard
                  session={session}
                  expanded={!!expandedSessions.get(session.sessionId)}
                  onToggle={() => toggleSession(session.sessionId)}
                />
              </div>
            );
          }

          // message item:跟前一项(可能是 foldSession 或 message)做 continue 判定
          const m = item.message;
          const bare = shouldRenderBare(m);
          // foldSession 后的 message 强制不 continue(显示完整 header)
          const prevMessage = prev?.type === "message" ? prev.message : undefined;
          const continueWithPrev = !bare && !showDivider && isContinue(m, prevMessage);
          return (
            <div key={m.clientMsgNo || m.messageID}>
              {showDivider ? <TimeDivider timestamp={currTs} /> : null}
              <MessageRow message={m} bare={bare} continueWithPrev={continueWithPrev} />
            </div>
          );
        })}
      </div>
      <ScrollToBottomButton
        visible={scrollBtn.visible}
        unreadCount={scrollBtn.unreadCount}
        onClick={scrollBtn.scrollToBottom}
      />
    </div>
  );
}
