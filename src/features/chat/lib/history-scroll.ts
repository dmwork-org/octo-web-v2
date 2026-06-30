/**
 * 消息列表向上拉历史时的滚动定位 helper(对齐旧 dmworkbase
 * Components/Conversation/historyScroll.ts)。
 *
 * 核心问题:消息列表 prepend 历史消息后,scrollHeight 增长了 ΔH,如果不调
 * scrollTop 用户视口里看到的位置会被推到下面(默认 scrollTop 不变,但内容上面多
 * 了一截)。把 scrollTop += ΔH,视觉位置不变,体感是"用户停在原地,新内容从顶部
 * 增长出来"。
 */

/** 触发顶部加载的距离阈值:scrollTop <= 250 才认为"已到顶部附近"。 */
export const TOP_HISTORY_TRIGGER_OFFSET = 250;

/** 触发底部补新消息的距离阈值:离底部 <= 800 即预加载。 */
export const BOTTOM_NEWER_TRIGGER_OFFSET = 800;

export interface PulldownScrollRestoreInput {
  previousScrollHeight: number;
  previousScrollTop: number;
  nextScrollHeight: number;
}

/**
 * 给定 prepend 前后 scrollHeight + 之前的 scrollTop,算出 prepend 后应设的 scrollTop。
 *
 * 逻辑:nextScrollTop = prevScrollTop + (nextScrollHeight - prevScrollHeight)
 * 兜底 < 0 → 0(极端情况内容反向缩短时不出负值)。
 */
export function getPulldownRestoredScrollTop(input: PulldownScrollRestoreInput): number {
  const next = input.previousScrollTop + (input.nextScrollHeight - input.previousScrollHeight);
  return next < 0 ? 0 : next;
}

/**
 * 判断当前 scrollTop 是否在"顶部附近"(适合触发拉历史)。
 *
 * 旧版还有 wheel deltaY + isFullScreen 的兜底(内容不满屏时 wheel 向上即触发);
 * 本版本初版只看 scrollTop 距离,不满屏场景由 hasNextPage + 不会再 fetch 兜底
 * (后端没更老消息时 hasNextPage=false,顶部即静止)。
 */
export function isNearTopForHistory(scrollTop: number): boolean {
  return scrollTop <= TOP_HISTORY_TRIGGER_OFFSET;
}

/** 距离底部的像素(用于 isNearBottom 判断,新消息到时是否自动跟到底)。 */
export function distanceFromBottom(el: HTMLElement): number {
  return el.scrollHeight - el.scrollTop - el.clientHeight;
}

export function isNearBottomForNewer(el: HTMLElement): boolean {
  return distanceFromBottom(el) <= BOTTOM_NEWER_TRIGGER_OFFSET;
}
