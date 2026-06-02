import {
  MENTION_LABEL_HUMANS,
  MENTION_UID_LEGACY_ALL,
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
 * @所有人 / @all / @everyone 都映射到 legacy all(mention.all=1,server 端 rewrite 成
 * humans=1)— 与旧仓 parseMentionMarkers 同口径。
 */
export function buildVoiceMentionRegex(members: VoiceMentionMember[]): RegExp {
  const specialNames = ["所有人", "all", "everyone"];
  const allNames = [...specialNames, ...members.map((m) => m.name)];
  const unique = [...new Set(allNames)];
  unique.sort((a, b) => b.length - a.length);
  const pattern = unique.map(escapeRegExp).join("|");
  return new RegExp(`@(${pattern})(?=[\\s，。！？,!?]|$)`, "gi");
}

/**
 * 解析语音转写文本里的 @mention 标记,转成 TipTap content 节点数组。
 *
 * 1:1 对齐旧 dmworkbase MessageInput parseMentionMarkers:
 *   - 匹配 `@{member.name}` / `@所有人` / `@all` / `@everyone`
 *   - 匹配项后吞掉一个空白(避免插入 mention 后多个空格)
 *   - 不匹配的 @ 保留原文(不转 mention)
 *
 * 如果 members 为空或文本不含 "@",直接返回单个 text 节点(兼容 inserContent)。
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

    const isAll =
      name === MENTION_LABEL_HUMANS ||
      name.toLowerCase() === "all" ||
      name.toLowerCase() === "everyone";
    const member = members.find((m) => m.name.toLowerCase() === name.toLowerCase());

    if (isAll) {
      result.push({
        type: "mention",
        attrs: { id: MENTION_UID_LEGACY_ALL, label: MENTION_LABEL_HUMANS },
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
    if ((isAll || member) && lastIndex < text.length && /\s/.test(text[lastIndex])) {
      lastIndex++;
    }
  }

  if (lastIndex < text.length) {
    result.push({ type: "text", text: text.slice(lastIndex) });
  }
  return result;
}
