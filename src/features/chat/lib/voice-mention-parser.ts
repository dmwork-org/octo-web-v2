import {
  MENTION_LABEL_AIS,
  MENTION_LABEL_HUMANS,
  MENTION_UID_AIS,
  MENTION_UID_HUMANS,
} from "@/features/base/lib/mention-three-state";

export interface VoiceMentionMember {
  uid: string;
  name: string;
}

/** TipTap insertContent 接受的节点形态(text 段 + mention 节点)。 */
export type ParsedNode =
  | { type: "text"; text: string }
  | { type: "mention"; attrs: { id: string; label: string } };

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 动态构造 @name 匹配正则。名字按 length 倒序避免短名错误抢匹配("Cindy Che" 先于 "Cindy")。
 *
 * 边界:右侧必须紧跟空格 / 中英文标点 / 行末,避免 "@张三北京" 误识别成 "@张三"。
 *
 * 三态(对齐上游 2e89e772):
 *   @所有人 / @all / @everyone → HUMANS(mention.humans=1,纯人不含 AI)
 *   @所有AI / @All AIs        → AIS(mention.ais=1,全部 bot)
 *
 * 老 LEGACY_ALL(-1)不再由语音转写产生 — 它是早期"all" 语义,server 端会 rewrite 成
 * humans=1;新 HUMANS/AIS 拆分后语音侧直接发对应三态,避免歧义。
 */
export function buildVoiceMentionRegex(members: VoiceMentionMember[]): RegExp {
  const specialNames = ["所有人", "all", "everyone", "所有AI", "All AIs"];
  const allNames = [...specialNames, ...members.map((m) => m.name)];
  const unique = [...new Set(allNames)];
  unique.sort((a, b) => b.length - a.length);
  const pattern = unique.map(escapeRegExp).join("|");
  return new RegExp(`@(${pattern})(?=[\\s，。！？,!?]|$)`, "gi");
}

/**
 * 解析语音转写文本里的 @mention 标记,转成 TipTap content 节点数组。
 *
 * 1:1 对齐上游 `2e89e772` parseMentionMarkers(拆 humans/ais 三态版):
 *   - `@{member.name}` → 普通 mention(uid=member.uid)
 *   - `@所有人 / @all / @everyone` → HUMANS mention(uid=-2)
 *   - `@所有AI / @All AIs` → AIS mention(uid=-3)
 *   - 匹配项后吞掉一个空白(避免插入 mention 后多个空格)
 *   - 不匹配的 @ 保留原文(不转 mention)
 *
 * 如果 members 为空或文本不含 "@",直接返回单个 text 节点(兼容 insertContent)。
 */
export function parseVoiceMentions(text: string, members: VoiceMentionMember[]): ParsedNode[] {
  if (!text) return [];
  if (members.length === 0 || !text.includes("@")) {
    return [{ type: "text", text }];
  }

  const result: ParsedNode[] = [];
  const regex = buildVoiceMentionRegex(members);
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const name = match[1];
    const matchStart = match.index;

    if (matchStart > lastIndex) {
      result.push({ type: "text", text: text.slice(lastIndex, matchStart) });
    }

    const lower = name.toLowerCase();
    const isHumans = name === MENTION_LABEL_HUMANS || lower === "all" || lower === "everyone";
    const isAis = name === MENTION_LABEL_AIS || lower === "all ais";
    const member = members.find((m) => m.name.toLowerCase() === lower);

    if (isHumans) {
      result.push({
        type: "mention",
        attrs: { id: MENTION_UID_HUMANS, label: MENTION_LABEL_HUMANS },
      });
      result.push({ type: "text", text: " " });
    } else if (isAis) {
      result.push({
        type: "mention",
        attrs: { id: MENTION_UID_AIS, label: MENTION_LABEL_AIS },
      });
      result.push({ type: "text", text: " " });
    } else if (member) {
      result.push({
        type: "mention",
        attrs: { id: member.uid, label: member.name },
      });
      result.push({ type: "text", text: " " });
    } else {
      result.push({ type: "text", text: match[0] });
    }

    lastIndex = match.index + match[0].length;
    if ((isHumans || isAis || member) && lastIndex < text.length && /\s/.test(text[lastIndex])) {
      lastIndex++;
    }
  }

  if (lastIndex < text.length) {
    result.push({ type: "text", text: text.slice(lastIndex) });
  }
  return result;
}
