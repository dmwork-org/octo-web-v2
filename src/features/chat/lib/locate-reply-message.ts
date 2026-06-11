import type { QueryClient, InfiniteData } from "@tanstack/react-query";
import WKSDK, { PullMode, type Channel, type Message } from "wukongimjssdk";
import { messagesInfiniteQueryOptions } from "@/features/chat/queries/messages.query";

/** 历史拉取页数封顶(10 × 30 = 300 条),避免引用 500 条前消息时无限拉。 */
const MAX_PAGES_TO_PULL = 10;
const LOCATE_WINDOW_BEFORE = 5;
const LOCATE_WINDOW_LIMIT = 30;

/** fetch 完成到 React 渲染需要等一帧;50ms 涵盖大多数 paint。 */
const RENDER_WAIT_MS = 50;

/**
 * 点击 reply 块跳转原消息 — 若不在当前 InfiniteQuery 已加载页,
 * 循环拉历史 + 重试 querySelector,直到找到 / 到顶 / 超过 cap。
 *
 * 只保留给聊天内 reply 块使用,尽量不替换当前消息窗口。外部入口跳原文走
 * locateMessageWindow,避免从最新消息开始逐页翻历史。
 *
 * @returns 找到的 DOM 元素;到顶或超过 cap 仍找不到 → null(caller 弹 toast)
 */
export async function locateReplyMessage(
  qc: QueryClient,
  channel: Channel,
  messageSeq: number,
  signal?: AbortSignal,
): Promise<HTMLElement | null> {
  let el = findEl(messageSeq);
  if (el) return el;

  for (let i = 0; i < MAX_PAGES_TO_PULL; i++) {
    if (signal?.aborted) return null;
    const appended = await fetchOneMorePage(qc, channel);
    if (!appended) break; // 到顶
    await sleep(RENDER_WAIT_MS); // 等 React commit + paint
    el = findEl(messageSeq);
    if (el) return el;
  }
  return null;
}

/**
 * 按 messageSeq 直接拉一段定位窗口,用于外部入口(智能总结/事项)跳原文。
 *
 * 对齐上游 ShowConversationOptions.initLocateMessageSeq:
 * `startMessageSeq = seq - 5` + `PullMode.Up` 一次拿到原文附近窗口,避免为了
 * 定位一条旧消息从最新页开始连续 pull 历史,触发 message/channel/sync 429。
 */
export async function locateMessageWindow(
  qc: QueryClient,
  channel: Channel,
  messageSeq: number,
  signal?: AbortSignal,
): Promise<HTMLElement | null> {
  let el = findEl(messageSeq);
  if (el) return el;
  if (signal?.aborted) return null;

  const page = await fetchLocateWindow(channel, messageSeq);
  if (signal?.aborted) return null;

  const opts = messagesInfiniteQueryOptions(channel);
  qc.setQueryData<InfiniteData<Message[], number>>(opts.queryKey, {
    pages: [page],
    pageParams: [locateWindowStart(messageSeq)],
  });

  await sleep(RENDER_WAIT_MS);
  el = findEl(messageSeq);
  return el;
}

function findEl(seq: number): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-msg-seq="${seq}"]`);
}

function locateWindowStart(messageSeq: number): number {
  return Math.max(messageSeq - LOCATE_WINDOW_BEFORE, 0);
}

async function fetchLocateWindow(channel: Channel, messageSeq: number): Promise<Message[]> {
  const list = await WKSDK.shared().chatManager.syncMessages(channel, {
    startMessageSeq: locateWindowStart(messageSeq),
    endMessageSeq: 0,
    limit: LOCATE_WINDOW_LIMIT,
    pullMode: PullMode.Up,
  });
  return (list ?? []).filter((m) => !m.isDeleted);
}

/**
 * 手动拉下一页(更老消息)并 append 到 InfiniteQuery cache。
 *
 * 不用 `qc.fetchInfiniteQuery({pages: N})` 是因为 v5 该选项行为是 "从第一页
 * 重新拉到第 N 页",会用 initialPageParam=0 重复拉最新,而不是基于现有最旧
 * 往前拉。手动 setQueryData append 更直接、可控。
 */
async function fetchOneMorePage(qc: QueryClient, channel: Channel): Promise<boolean> {
  const opts = messagesInfiniteQueryOptions(channel);
  const data = qc.getQueryData<InfiniteData<Message[], number>>(opts.queryKey);
  if (!data || data.pages.length === 0) return false;
  const lastPage = data.pages[data.pages.length - 1];
  const lastParam = data.pageParams[data.pageParams.length - 1];
  const next = opts.getNextPageParam!(lastPage, data.pages, lastParam, data.pageParams);
  if (next == null) return false; // 到顶
  const newPage = (await opts.queryFn!({
    queryKey: opts.queryKey,
    pageParam: next,
    signal: new AbortController().signal,
    meta: undefined,
    direction: "forward",
  } as never)) as Message[];
  qc.setQueryData<InfiniteData<Message[], number>>(opts.queryKey, (old) => {
    if (!old) return old;
    return {
      ...old,
      pages: [...old.pages, newPage],
      pageParams: [...old.pageParams, next],
    };
  });
  return true;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
