/**
 * chat-summary-created / chat-summary-deleted CustomEvent 包装。
 *
 * 用 window CustomEvent 而不是 React Query invalidate 的理由:
 *   - chat panel(ChatSummaryHistory)、header 入口(SummaryStarButton)、远端
 *     summary view 三处都需要响应"刚创建/删除了一条总结",但它们不属于同一
 *     query key 树(panel 按 origin_channel_id 过滤、view 是全量列表)。CustomEvent
 *     是天然的"广播-订阅",订阅方按自己关心的 channelId 过滤。
 *   - 也兼容老仓 ChatSummaryStarButton / ChatSummaryHistory 用了同名事件的语义。
 */

const CREATED = "chat-summary-created";
const DELETED = "chat-summary-deleted";

export interface ChatSummaryEventDetail {
  channelId: string;
  taskId?: number;
}

export function notifyChatSummaryCreated(detail: ChatSummaryEventDetail): void {
  window.dispatchEvent(new CustomEvent<ChatSummaryEventDetail>(CREATED, { detail }));
}

export function notifyChatSummaryDeleted(detail: ChatSummaryEventDetail): void {
  window.dispatchEvent(new CustomEvent<ChatSummaryEventDetail>(DELETED, { detail }));
}

/** 订阅"创建" / "删除"任一事件,channelId 匹配时回调。返回 unsubscribe。 */
export function subscribeChatSummaryEvents(
  channelId: string,
  cb: (detail: ChatSummaryEventDetail) => void,
): () => void {
  const handler = (e: Event) => {
    const detail = (e as CustomEvent<ChatSummaryEventDetail>).detail;
    if (detail?.channelId === channelId) cb(detail);
  };
  window.addEventListener(CREATED, handler);
  window.addEventListener(DELETED, handler);
  return () => {
    window.removeEventListener(CREATED, handler);
    window.removeEventListener(DELETED, handler);
  };
}
