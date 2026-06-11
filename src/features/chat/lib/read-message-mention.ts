import type { Mention } from "wukongimjssdk";

/** SDK Mention 缺 humans/ais 三态字段类型,本地补;运行时由 send-content-proxy 注入。 */
export type MentionWithFlags = Mention & { humans?: number; ais?: number };

/**
 * 从 message.content 读 mention 字段(对齐老仓 Utils/mentionRender.readMentionFlags):
 *   - **优先** `content.mention.{all,uids}`(SDK decode 后的标准字段)
 *   - **fallback** `content.contentObj.mention.{humans,ais,all,uids}`(wire 原始 JSON;
 *     SDK Mention 类只识别 all/uids,humans/ais 是我们扩展字段,SDK decode 时丢弃,
 *     但 MessageContent.contentObj 保留 raw)
 *
 * 不做这步 fallback,刷新后从 server 拉到的消息 mention.humans/ais 全是 undefined,
 * @所有人 / @所有AI 高亮丢失(发送时本端 mention 实例自带 humans/ais 走得通)。
 */
export function readMessageMention(content: unknown): MentionWithFlags | undefined {
  if (!content || typeof content !== "object") return undefined;
  const c = content as {
    mention?: MentionWithFlags;
    contentObj?: {
      mention?: { all?: number | boolean; uids?: string[]; humans?: number; ais?: number };
    };
  };
  const sdk = c.mention;
  const raw = c.contentObj?.mention;
  if (!sdk && !raw) return undefined;
  const merged: MentionWithFlags = {
    all: !!(sdk?.all ?? raw?.all),
    uids: sdk?.uids ?? raw?.uids ?? [],
  } as MentionWithFlags;
  const humans = sdk?.humans ?? raw?.humans;
  const ais = sdk?.ais ?? raw?.ais;
  if (humans) merged.humans = humans;
  if (ais) merged.ais = ais;
  return merged;
}

/**
 * 防御 mention.uids 含非法值时主动 fetchChannelInfo 触发 toast 风暴(issue #74):
 *
 * 某些历史消息 mention.uids 含字面 "uid" / sticky sentinel ("-1"/"-2"/"-3")
 * 等非法 uid,fetchChannelInfo 调到 `/v1/channels/{uid}/1` → 后端 400 →
 * 全局 errorToast 飘"用户信息不存在"。
 *
 * **形态白名单**:uid 必须是非空字符串、非 sentinel、长度 ≥ 6(后端真 uid
 * 通常是 32 位 hex 或类似,短的几乎全是错误数据)。
 *
 * **失败短期 blacklist (TTL 30s, issue #84)**:某些合法 uid 后端持续 4xx /
 * 5xx,React re-render 多次就会触发 N 次 fetch 风暴 → 后端"请求过于频繁"。
 * issue #73 曾完全移除 blacklist 解决"一次失败永久误拒",但带来 #84 的
 * 频繁触发问题。折衷:失败后 30s 内 isFetchableUid 返 false → 不 fetch,
 * 30s 后允许下一次重试。
 *   - 一次失败的合法 uid 不会永久误拒(用户切走再切回 / 等 30s 都能重试)
 *   - 持续失败的 uid 30s 内不会洪流
 */
const SENTINEL_UIDS = new Set(["-1", "-2", "-3", "@all", "uid"]);
const FAILED_TTL_MS = 30_000;
const failedUidAtMap = new Map<string, number>();

export function isFetchableUid(uid: string | undefined | null): boolean {
  if (!uid || typeof uid !== "string") return false;
  if (SENTINEL_UIDS.has(uid)) return false;
  if (uid.length < 6) return false;
  const failedAt = failedUidAtMap.get(uid);
  if (failedAt && Date.now() - failedAt < FAILED_TTL_MS) return false;
  return true;
}

export function markUidFetchFailed(uid: string): void {
  failedUidAtMap.set(uid, Date.now());
}
