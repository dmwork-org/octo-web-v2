import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import { type Channel, type Message } from "wukongimjssdk";
import { toast } from "@/components/semi-bridge/toast";
import { authStore } from "@/features/base/stores/auth";
import { MessageContentTypeConst } from "@/features/base/im/content-types";
import { messagesInfiniteQueryOptions } from "@/features/chat/queries/messages.query";
import { useMessagesSync } from "@/features/chat/hooks/use-messages-sync.hook";
import { useClearUnreadOnEnter } from "@/features/chat/hooks/use-clear-unread.hook";
import { useChannelInfoTick } from "@/features/chat/hooks/use-channel-info-tick.hook";
import { useScrollToBottomButton } from "@/features/chat/hooks/use-scroll-to-bottom-button.hook";
import { useTypingForChannel } from "@/features/chat/hooks/use-typing-for-channel.hook";
import { chatAiCollabFoldActions } from "@/features/chat/stores/ai-collab-fold";
import { MessageRow } from "@/features/chat/components/message-row";
import { TimeDivider } from "@/features/chat/components/time-divider";
import { HistoryDivider } from "@/features/chat/components/history-divider";
import { useHistorySplitAnchor } from "@/features/chat/hooks/use-history-split.hook";
import { FoldSessionCard } from "@/features/chat/components/fold-session-card";
import { ScrollToBottomButton } from "@/features/chat/components/scroll-to-bottom-button";
import { TypingIndicator } from "@/features/chat/components/typing-indicator";
import { buildRenderItems, type RenderItem } from "@/features/chat/lib/fold-session";
import { locateMessageWindow, locateReplyMessage } from "@/features/chat/lib/locate-reply-message";
import {
  chatLocateMessageActions,
  chatLocateMessageStore,
} from "@/features/chat/stores/chat-locate-message";
import {
  distanceFromBottom,
  getPulldownRestoredScrollTop,
  isNearTopForHistory,
} from "@/features/chat/lib/history-scroll";
import { useT } from "@/lib/i18n/use-t";

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
 *   pre 存在 + 非系统(bare)消息 + 同 sender + **10 分钟内**(对齐上游 195625e8 / #113)
 * 同一发送者跨长间隔(>10min)不聚合,避免"早上一条 + 下午一条"挤成一个 header。
 *
 * **boundary 类**(对齐上游 c2f9e18e / #308 + Service/messageContinuity.ts isBoundaryMessage):
 *   screenshot(contentType=20)即使 fromUID 同也打断 continuation — 截屏是居中胶囊,
 *   不属"对话气泡流",前后正常消息必须重新显示头像/sender。
 */
function isContinue(curr: Message, prev: Message | undefined): boolean {
  if (!prev) return false;
  if (shouldRenderBare(prev) || shouldRenderBare(curr)) return false;
  if (
    prev.contentType === MessageContentTypeConst.screenshot ||
    curr.contentType === MessageContentTypeConst.screenshot
  ) {
    return false;
  }
  if (!prev.fromUID || prev.fromUID !== curr.fromUID) return false;
  // 10 分钟阈值(秒级 timestamp);对齐上游 MESSAGE_CONTINUATION_MAX_GAP_SEC
  const prevTs = prev.timestamp;
  const currTs = curr.timestamp;
  if (typeof prevTs !== "number" || typeof currTs !== "number") return true;
  if (!Number.isFinite(prevTs) || !Number.isFinite(currTs)) return true;
  return Math.abs(currTs - prevTs) < 10 * 60;
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
  skip: boolean,
) {
  const initRef = useRef("");
  useLayoutEffect(() => {
    if (!firstReadyKey) return;
    if (initRef.current === firstReadyKey) return;
    if (skip) {
      initRef.current = firstReadyKey;
      return;
    }
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    initRef.current = firstReadyKey;
  }, [firstReadyKey, scrollRef, skip]);
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
  skip: boolean,
) {
  const lastIdRef = useRef("");
  useLayoutEffect(() => {
    if (!key.id || lastIdRef.current === key.id) return;
    if (skip) {
      lastIdRef.current = key.id;
      return;
    }
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
  }, [key.id, key.mine, scrollRef, skip]);
}

/**
 * typing indicator 出现时也跟到底(对齐旧 vm.typingListener `scrollToBottom(false)`)。
 * key 用 typing.fromUID,同一 bot 连续 typing 不重复跟。
 */
function useFollowBottomOnTyping(
  scrollRef: React.RefObject<HTMLDivElement | null>,
  typingKey: string,
) {
  const lastKeyRef = useRef("");
  useLayoutEffect(() => {
    if (!typingKey || lastKeyRef.current === typingKey) {
      lastKeyRef.current = typingKey;
      return;
    }
    lastKeyRef.current = typingKey;
    const el = scrollRef.current;
    if (!el) return;
    if (distanceFromBottom(el) < NEAR_BOTTOM_THRESHOLD) {
      el.scrollTop = el.scrollHeight;
    }
  }, [typingKey, scrollRef]);
}

function usePulldownToLoadHistory(
  scrollRef: React.RefObject<HTMLDivElement | null>,
  pageCount: number,
  hasNextPage: boolean,
  isFetchingNextPage: boolean,
  fetchNextPage: () => void,
  skip: boolean,
) {
  const snapshotRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
  const prevPageCountRef = useRef(pageCount);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      if (skip) return;
      if (!hasNextPage || isFetchingNextPage) return;
      if (!isNearTopForHistory(el.scrollTop)) return;
      snapshotRef.current = { scrollHeight: el.scrollHeight, scrollTop: el.scrollTop };
      fetchNextPage();
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [scrollRef, hasNextPage, isFetchingNextPage, fetchNextPage, skip]);

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

function highlightLocatedMessage(el: HTMLElement): void {
  el.scrollIntoView({ behavior: "auto", block: "center" });
  const prevRadius = el.style.borderRadius;
  el.style.borderRadius = "8px";
  const anim = el.animate(
    [
      { backgroundColor: "rgba(28, 28, 35, 0.1)" },
      { backgroundColor: "rgba(28, 28, 35, 0.06)", offset: 0.6 },
      { backgroundColor: "transparent" },
    ],
    { duration: 2000, easing: "ease-out", fill: "forwards" },
  );
  anim.onfinish = () => {
    anim.cancel();
    el.style.borderRadius = prevRadius;
  };
}

function useLocateRequestedMessage(channel: Channel, ready: boolean): void {
  const t = useT();
  const qc = useQueryClient();
  const request = useStore(chatLocateMessageStore, (s) => s);

  useEffect(() => {
    if (!ready || !request.messageSeq) return;
    if (request.channelId !== channel.channelID || request.channelType !== channel.channelType) {
      return;
    }

    let cancelled = false;
    const requestId = request.requestId;
    const messageSeq = request.messageSeq;

    async function locate() {
      let el = document.querySelector<HTMLElement>(`[data-msg-seq="${messageSeq}"]`);
      if (!el) {
        const loadingId = toast.loading(t("messageRow.replyLoading"));
        try {
          el =
            request.strategy === "window"
              ? await locateMessageWindow(qc, channel, messageSeq)
              : await locateReplyMessage(qc, channel, messageSeq);
        } finally {
          toast.dismiss(loadingId);
        }
      }
      if (cancelled) return;
      if (!el) {
        toast.warning(t("messageRow.replyNotFound"));
        chatLocateMessageActions.clear(requestId);
        return;
      }
      highlightLocatedMessage(el);
      chatLocateMessageActions.clear(requestId);
    }

    void locate();
    return () => {
      cancelled = true;
    };
  }, [
    channel,
    qc,
    ready,
    request.channelId,
    request.channelType,
    request.messageSeq,
    request.requestId,
    request.strategy,
    t,
  ]);
}

/**
 * 把"末尾是 active AI 协作 fold session"的信号写到全局 store(issue #33,对齐老仓
 * vm.ts:451-462)。会话列表行的 `ConversationTypingDigest` 订阅本 store,有 fold
 * preview 时把 "AI协作中 · 参与者 × ··· · N条" 替代普通 lastMessage digest。
 *
 * **判定规则**(对齐老仓):忽略末尾 typing item(transient 状态),取真正的"最后一项",
 * 必须是 `foldSession` **且** `session.isActive`(最后一条 bot 消息距今 < 120s)。
 * 不 active(超时已死的旧 fold)→ 视为普通历史不显 AI 协作 tag。
 *
 * **cleanup**:组件卸载(切 channel / 退会话 / unmount)→ remove,避免旧 channel
 * 状态残留到会话列表行(否则用户离开会话后还显"AI协作中"是 stale)。
 */
function useSyncAiCollabFoldDigest(channel: Channel, renderItems: RenderItem[]): void {
  useEffect(() => {
    let lastReal: RenderItem | undefined;
    for (let i = renderItems.length - 1; i >= 0; i--) {
      const item = renderItems[i];
      if (item.type === "message" && item.message.contentType === MessageContentTypeConst.typing) {
        continue;
      }
      lastReal = item;
      break;
    }
    if (lastReal && lastReal.type === "foldSession" && lastReal.session.isActive) {
      chatAiCollabFoldActions.set(channel, {
        participants: lastReal.session.participants.map((p) => p.name),
        count: lastReal.session.messages.length,
      });
    } else {
      chatAiCollabFoldActions.remove(channel);
    }
    return () => {
      chatAiCollabFoldActions.remove(channel);
    };
  }, [channel, renderItems]);
}

function useExpandLocatedFoldSession(
  renderItems: RenderItem[],
  pendingLocateForChannel: boolean,
  messageSeq: number | null | undefined,
  setExpandedSessions: React.Dispatch<React.SetStateAction<Map<string, boolean>>>,
): void {
  useEffect(() => {
    if (!pendingLocateForChannel || !messageSeq) return;
    const hit = renderItems.find(
      (item) =>
        item.type === "foldSession" &&
        item.session.messages.some((message) => message.messageSeq === messageSeq),
    );
    if (!hit || hit.type !== "foldSession") return;
    setExpandedSessions((prev) => {
      if (prev.get(hit.session.sessionId)) return prev;
      const next = new Map(prev);
      next.set(hit.session.sessionId, true);
      return next;
    });
  }, [messageSeq, pendingLocateForChannel, renderItems, setExpandedSessions]);
}

export function MessageList({ channel }: MessageListProps) {
  const t = useT();
  useMessagesSync(channel);
  useClearUnreadOnEnter(channel);
  // issue #32:进会话时锁定历史/新消息分割线锚点(unread > 0 时返回最后已读 seq)
  const historySplitAfterSeq = useHistorySplitAnchor(channel);
  const myUid = useStore(authStore, (s) => s.user?.uid ?? "");
  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery(messagesInfiniteQueryOptions(channel));

  const scrollRef = useRef<HTMLDivElement>(null);
  // typing info(per-channel)— bot CMD typing 推送 → TypingManager → 本 hook 同步
  const typing = useTypingForChannel(channel);
  const locateRequest = useStore(chatLocateMessageStore, (s) => s);

  const messages = useMemo(() => {
    const all = (data?.pages ?? []).flat();
    // 排序:**timestamp 主键**(秒,跨 ack/pending 一致),seq 次键(同秒消息稳定)。
    //
    // 为什么不用 messageSeq:bot 真消息 ack 后 seq=N,我刚发消息 pending(seq=0),
    // 如果按 seq 排 bot 会排在我前面(截图 #35 的视觉错乱)。timestamp 排序:
    // 我消息 client 时间 = 发送瞬间 < bot 消息 server 时间 = 处理瞬间 →
    // 我消息正确显示在 bot 之前。
    //
    // timestamp 缺失(=0)的极端 case fallback 用 seq 兜底排序稳定。
    return [...all].sort((a, b) => {
      const ta = a.timestamp || 0;
      const tb = b.timestamp || 0;
      if (ta !== tb) return ta - tb;
      return (a.messageSeq || 0) - (b.messageSeq || 0);
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
  const pendingLocateForChannel =
    !!locateRequest.messageSeq &&
    locateRequest.channelId === channel.channelID &&
    locateRequest.channelType === channel.channelType;

  useExpandLocatedFoldSession(
    renderItems,
    pendingLocateForChannel,
    locateRequest.messageSeq,
    setExpandedSessions,
  );

  useInitialScrollToBottom(scrollRef, firstReadyKey, pendingLocateForChannel);
  useFollowBottomOnNewMessages(scrollRef, followKey, pendingLocateForChannel);
  useFollowBottomOnTyping(scrollRef, typing?.fromUID ?? "");
  usePulldownToLoadHistory(
    scrollRef,
    data?.pages.length ?? 0,
    !!hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    pendingLocateForChannel,
  );
  useLocateRequestedMessage(channel, !isLoading && !error && !!data);
  useSyncAiCollabFoldDigest(channel, renderItems);

  // 右下角 scroll-to-bottom 按钮 + 未读徽标(对齐旧 ConversationPositionView,
  // issue #31 修复:用末尾消息稳定 id 替代 messages.length,避免向上拉历史时
  // messages.length 增加被误判为新消息)。复用 followKey 的 id + mine 标识。
  const scrollBtn = useScrollToBottomButton(scrollRef, followKey.id, followKey.mine);

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
        {t("messageList.loading")}
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-error">
        {t("messageList.loadFailed")}
      </div>
    );
  }
  if (messages.length === 0 && !typing) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
        {t("messageList.empty")}
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col" style={{ backgroundColor: "#f6f6f6" }}>
      <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-3">
        {hasNextPage ? (
          <div className="flex justify-center py-2 text-xs text-text-tertiary">
            {isFetchingNextPage ? t("messageList.loadingEarlier") : t("messageList.pullToLoadMore")}
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
          // issue #32:此消息是"最后已读"时,渲染完后追加历史分割线
          const isHistorySplitAnchor =
            historySplitAfterSeq > 0 && m.messageSeq === historySplitAfterSeq;
          return (
            <div key={m.clientMsgNo || m.messageID}>
              {showDivider ? <TimeDivider timestamp={currTs} /> : null}
              <MessageRow message={m} bare={bare} continueWithPrev={continueWithPrev} />
              {isHistorySplitAnchor ? <HistoryDivider /> : null}
            </div>
          );
        })}
        {typing ? <TypingIndicator info={typing} /> : null}
      </div>
      <ScrollToBottomButton
        visible={scrollBtn.visible}
        unreadCount={scrollBtn.unreadCount}
        onClick={scrollBtn.scrollToBottom}
      />
    </div>
  );
}
