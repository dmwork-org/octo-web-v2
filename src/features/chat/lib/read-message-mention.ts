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
 * **不**做"已失败 uid blacklist" — 之前曾加 markUidFetchFailed 一次失败永久
 * 拒绝,但合法 uid 偶尔 fetch 失败会被永久误拒 → 永久不高亮(issue #73 误改成
 * 完全不显的真凶)。SDK 内部 fetchChannelInfo 自带 promise 去重保证 in-flight
 * 不重复发 HTTP,失败后下次 re-render 自然重试。toast 飘满由 withErrorToast
 * 自带的 key 去重已经解决。
 */
const SENTINEL_UIDS = new Set(["-1", "-2", "-3", "@all", "uid"]);

export function isFetchableUid(uid: string | undefined | null): boolean {
  if (!uid || typeof uid !== "string") return false;
  if (SENTINEL_UIDS.has(uid)) return false;
  if (uid.length < 6) return false;
  return true;
}
