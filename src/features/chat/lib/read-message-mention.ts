import type { Mention } from "wukongimjssdk";

/**
 * 单条 mention range(对齐 wukong IM 协议的 `mention.entities[i]`):
 *   - `offset` + `length` 直接指明 text 里 `@xxx` 的字符位置(UTF-16,JS string
 *     原生坐标)
 *   - `uid` 通常是被 @ 用户的真 uid;**但 bot 后端可能填占位串 "uid"**(issue
 *     #85),这种情况下 chip 渲染成不可点击形态。
 */
export interface MentionEntity {
  offset: number;
  length: number;
  uid: string;
}

/** SDK Mention 缺 humans/ais 三态字段类型,本地补;运行时由 send-content-proxy 注入。 */
export type MentionWithFlags = Mention & {
  humans?: number;
  ais?: number;
  /**
   * **issue #85**:bot 后端按协议在 `content.contentObj.mention.entities` 给
   * 每个 @ 的字符位置(offset/length),但 uids 列里只塞了字面占位 "uid",
   * candidate name 主路径完全无法匹配。前端读这字段在 text 上直接圈 chip,
   * 不依赖 candidate 反查,补齐 bot 消息的 @ 高亮。
   *
   * SDK Mention 类不识别 entities,需走 contentObj 原始 JSON 读。
   */
  entities?: MentionEntity[];
};

/**
 * 从 message.content 读 mention 字段(对齐老仓 Utils/mentionRender.readMentionFlags):
 *   - **优先** `content.mention.{all,uids}`(SDK decode 后的标准字段)
 *   - **fallback** `content.contentObj.mention.{humans,ais,all,uids,entities}`(wire
 *     原始 JSON;SDK Mention 类只识别 all/uids,humans/ais/entities 是扩展字段,
 *     SDK decode 时丢弃,但 MessageContent.contentObj 保留 raw)
 *
 * 不做这步 fallback,刷新后从 server 拉到的消息 mention.humans/ais 全是 undefined,
 * @所有人 / @所有AI 高亮丢失(发送时本端 mention 实例自带 humans/ais 走得通)。
 */
export function readMessageMention(content: unknown): MentionWithFlags | undefined {
  if (!content || typeof content !== "object") return undefined;
  const c = content as {
    mention?: MentionWithFlags;
    contentObj?: {
      mention?: {
        all?: number | boolean;
        uids?: string[];
        humans?: number;
        ais?: number;
        entities?: MentionEntity[];
      };
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
  const entities = sdk?.entities ?? raw?.entities;
  if (entities && entities.length > 0) merged.entities = entities;
  return merged;
}

/**
 * 判断 mention uid 是否像真 uid(配合 entity 主路径,issue #85)。
 *
 * bot 后端在 mention.entities[i].uid 填占位字符串 `"uid"`,前端读到这种 entity
 * 时不能直接渲染可点击 chip(点不出用户卡片)。判定规则:
 *   - 非空
 *   - 不等于字面占位 `"uid"`
 *   - 长度 ≥ 6(真 uid 通常 32 位 hex,短的几乎全是脏数据)
 *
 * 不像真 uid 时 caller 通常 fallback 反查(`lookupUidByDisplayName`),反查不
 * 命中就渲染不可点击 chip。
 */
export function isLikelyRealUid(uid: string | undefined | null): boolean {
  if (!uid || typeof uid !== "string") return false;
  if (uid === "uid") return false;
  if (uid.length < 6) return false;
  return true;
}
