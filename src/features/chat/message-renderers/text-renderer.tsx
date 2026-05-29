import WKSDK, {
  Channel,
  ChannelTypePerson,
  type Mention,
  type Message,
  type MessageText,
} from "wukongimjssdk";
import { Fragment, type ReactNode } from "react";

interface TextRendererProps {
  message: Message;
}

/**
 * @ 提及高亮 tag(对应旧 dmworkbase Messages/Text MarkdownContent mention):
 * brand 色文本 + 浅 brand 底胶囊,@all 用纯 brand 色无背景。
 * 本期点击 noop(P3-A6 接 UserInfoModal / BotDetailModal)。
 */
function MentionTag({ children, isAll }: { children: string; isAll?: boolean }) {
  return (
    <span
      className={
        isAll ? "font-medium text-brand" : "rounded-sm bg-brand/10 px-1 font-medium text-brand"
      }
    >
      {children}
    </span>
  );
}

/**
 * 把 text 按 mention 字段切片为 (string | MentionTag)[]。
 *
 * 策略:
 * - 拿 mention.uids 各 uid 查 WKSDK channelInfo 拿 title(name 候选)
 * - 文本中精确匹配 `@<name>` 子串包 MentionTag(brand 胶囊)
 * - mention.all=true 时,额外把 `@所有人` / `@all` 高亮(纯 brand 色无背景)
 * - 无匹配则原文返回
 *
 * **不**做"任何 @<word> 都高亮"(避免误识别邮件 / 字面值),只信任 mention 字段。
 */
function parseTextWithMentions(text: string, mention: Mention | undefined): ReactNode[] {
  if (!text) return [];
  if (!mention || (!mention.uids?.length && !mention.all)) return [text];

  // 候选 @<name> 列表(带 @ 前缀,按长度降序避免短名先匹配吃掉长名)
  const names: { token: string; isAll: boolean }[] = [];
  if (mention.all) {
    names.push({ token: "@所有人", isAll: true }, { token: "@all", isAll: true });
  }
  for (const uid of mention.uids ?? []) {
    const info = WKSDK.shared().channelManager.getChannelInfo(new Channel(uid, ChannelTypePerson));
    const title = info?.title;
    if (title) names.push({ token: `@${title}`, isAll: false });
  }
  if (names.length === 0) return [text];
  names.sort((a, b) => b.token.length - a.token.length);

  // 单次扫描:从左到右尝试匹配候选 token,命中则切出 MentionTag,否则推进 1 字符
  const out: ReactNode[] = [];
  let buf = "";
  let i = 0;
  while (i < text.length) {
    let matched: { token: string; isAll: boolean } | null = null;
    for (const n of names) {
      if (text.startsWith(n.token, i)) {
        matched = n;
        break;
      }
    }
    if (matched) {
      if (buf) {
        out.push(buf);
        buf = "";
      }
      out.push(
        <MentionTag key={`m-${i}`} isAll={matched.isAll}>
          {matched.token}
        </MentionTag>,
      );
      i += matched.token.length;
    } else {
      buf += text[i];
      i++;
    }
  }
  if (buf) out.push(buf);
  return out;
}

/**
 * 文本消息正文(不带气泡 — Slack 风格,头像 + sender 在 MessageRow wrapper 内)。
 * 保留 whitespace-pre-wrap 让换行可见;mention 字段解析高亮(audit-v2 §2.1)。
 */
export function TextRenderer({ message }: TextRendererProps) {
  const content = message.content as MessageText;
  const text = content.text ?? "";
  const parts = parseTextWithMentions(text, content.mention);
  return (
    <p className="text-sm leading-snug whitespace-pre-wrap text-text-primary">
      {parts.map((p, idx) => (typeof p === "string" ? <Fragment key={idx}>{p}</Fragment> : p))}
    </p>
  );
}
