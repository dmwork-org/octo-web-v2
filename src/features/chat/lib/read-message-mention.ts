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
