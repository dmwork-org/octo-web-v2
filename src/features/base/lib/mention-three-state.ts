/**
 * Mention 三态(对齐旧 dmworkbase Utils/mentionRender):
 *
 * - LEGACY_ALL "-1":老 @所有人,发送 mention.all=1(server 端会 rewrite 成 humans=1)
 * - HUMANS     "-2":新 @所有人,mention.humans=1(纯人,不含 AI)
 * - AIS        "-3":新 @所有AI,mention.ais=1(全部 bot)
 *
 * 候选 popover 在 query 为空时置顶两个 sticky 项(HUMANS / AIS);query 非空时只过滤成员
 * (避免误选 sticky 而漏发个体)。
 *
 * 接收侧:`buildMessageMentions` 根据 mention.{humans,ais,all} 合成 @所有人 / @所有AI
 * 高亮 pill,与文本里的字面 "@所有人" / "@所有AI" 对齐。
 */
export const MENTION_UID_LEGACY_ALL = "-1";
export const MENTION_UID_HUMANS = "-2";
export const MENTION_UID_AIS = "-3";

/** 老 composer 内部用过的 @所有人 sentinel(发送时等价于 LEGACY_ALL → mention.all=1)。 */
export const MENTION_UID_OLD_ALL_ALIAS = "@all";

/** 接收侧合成高亮使用过的不可点击 sentinel,不应被粘贴/草稿恢复成可路由 mention。 */
export const MENTION_UID_RENDER_ALL = "all";

export const MENTION_LABEL_HUMANS = "所有人";
export const MENTION_LABEL_AIS = "所有AI";

/** sticky 候选项的 uid 集(给候选列表识别图标 + send 端识别三态)。 */
export const STICKY_MENTION_UIDS: ReadonlySet<string> = new Set([
  MENTION_UID_LEGACY_ALL,
  MENTION_UID_HUMANS,
  MENTION_UID_AIS,
  MENTION_UID_OLD_ALL_ALIAS,
]);

export function isStickyMentionUid(uid: string): boolean {
  return STICKY_MENTION_UIDS.has(uid);
}

export function isBroadcastSentinelUid(uid: string): boolean {
  return (
    uid === MENTION_UID_LEGACY_ALL ||
    uid === MENTION_UID_HUMANS ||
    uid === MENTION_UID_AIS ||
    uid === MENTION_UID_OLD_ALL_ALIAS ||
    uid === MENTION_UID_RENDER_ALL
  );
}

/** 用户可见的 mention 标签(发送时拼到 text 里;接收侧高亮匹配)。 */
export function stickyLabelOf(uid: string): string | undefined {
  if (uid === MENTION_UID_AIS) return MENTION_LABEL_AIS;
  if (
    uid === MENTION_UID_HUMANS ||
    uid === MENTION_UID_LEGACY_ALL ||
    uid === MENTION_UID_OLD_ALL_ALIAS
  ) {
    return MENTION_LABEL_HUMANS;
  }
  return undefined;
}
