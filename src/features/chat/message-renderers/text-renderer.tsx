import WKSDK, {
  Channel,
  ChannelTypeGroup,
  ChannelTypePerson,
  type Mention,
  type Message,
  type MessageText,
} from "wukongimjssdk";
import { openChatProfile } from "@/features/chat/lib/open-profile";
import { Markdown, type MarkdownToken } from "@/components/ui/markdown";

interface TextRendererProps {
  message: Message;
}

/**
 * @ 提及高亮 tag(对应旧 dmworkbase Messages/Text MarkdownContent mention):
 * brand 色文本 + 浅 brand 底胶囊,@all 用纯 brand 色无背景。
 * uid 非空时 click 弹 UserInfoModal / BotDetailModal(经 openChatProfile 判 bot)。
 */
function MentionTag({ children, isAll, uid }: { children: string; isAll?: boolean; uid?: string }) {
  const clickable = !isAll && !!uid;
  // 旧 mention-entity CSS:#6B3DD8 紫 + rgba(107,61,216,0.08) bg + 4px 圆角 + 2px/8px padding + 500
  // brand 主题色实际是 #1c1c23 黑灰,mention 紫色固定不随主题,inline 紫色值。
  const base = "inline-flex items-center rounded-[4px] px-2 py-[2px] font-medium text-[#6B3DD8]";
  if (!clickable) {
    return (
      <span className={isAll ? "font-medium text-[#6B3DD8]" : `${base} bg-[rgba(107,61,216,0.08)]`}>
        {children}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        openChatProfile(uid);
      }}
      className={`${base} cursor-pointer bg-[rgba(107,61,216,0.08)] hover:bg-[rgba(107,61,216,0.12)]`}
    >
      {children}
    </button>
  );
}

/**
 * 解析 uid → 当前消息上下文里 @ 文本里实际的 name。
 *
 * **关键**:发送端(MessageInput)插 mention 时 token 是 `@<member.name>`,
 * member.name 来自**群成员 subscriber 后端 enrich**,可能带后缀(如 `许建文(Nancy)`)。
 * 如果接收端用 Person channelInfo.title(IM channelInfoCallback 只填了 raw name
 * 比如 `许建文`)去匹配,就会**只命中 `@许建文`**,后面的 `(Nancy)` 漏在外面 —
 * 用户截图 10/11 对比的根因。
 *
 * 修复:群消息优先查 `getSubscribes(groupChannel)` 拿 `sub.name`,fallback
 * Person channelInfo.title。
 *
 * 对齐旧 dmworkbase:
 * - Components/MessageInput line 301:`@${member.name}`(发送端)
 * - bridge/useMessageRow:subscriberDisplayName 也优先 subscriber 路径
 */
function resolveMentionName(uid: string, channel: Channel): string | undefined {
  if (channel.channelType === ChannelTypeGroup) {
    const subs = WKSDK.shared().channelManager.getSubscribes(channel);
    const hit = subs?.find((s) => s.uid === uid);
    if (hit?.name) return hit.name;
  }
  const info = WKSDK.shared().channelManager.getChannelInfo(new Channel(uid, ChannelTypePerson));
  return info?.title || undefined;
}

/**
 * mention 字段 → Markdown tokens(供 `<Markdown>` 后处理替换):
 *
 * - mention.uids 各 uid 经 `resolveMentionName` 拿 @ 显示名 → "@<name>" token
 * - mention.all=true 时额外加 "@所有人" / "@all" token(纯色无 bg,不可 click)
 *
 * 不解析任意 `@<word>`(避免误识别邮件/字面值),只信任 mention 字段。
 */
function mentionTokens(mention: Mention | undefined, channel: Channel): MarkdownToken[] {
  if (!mention || (!mention.uids?.length && !mention.all)) return [];
  const tokens: MarkdownToken[] = [];
  if (mention.all) {
    for (const txt of ["@所有人", "@all"] as const) {
      tokens.push({
        match: txt,
        render: (key) => (
          <MentionTag key={key} isAll>
            {txt}
          </MentionTag>
        ),
      });
    }
  }
  for (const uid of mention.uids ?? []) {
    const name = resolveMentionName(uid, channel);
    if (!name) continue;
    const match = `@${name}`;
    tokens.push({
      match,
      render: (key) => (
        <MentionTag key={key} uid={uid}>
          {match}
        </MentionTag>
      ),
    });
  }
  return tokens;
}

/**
 * 文本消息正文 — markdown 渲染 + @mention 高亮(M1)。
 *
 * 对应旧 dmworkbase Messages/Text/MarkdownContent.tsx(404 行) 的精简版:
 * 只保留 react-markdown + remark-gfm + remark-breaks,不引入 highlight.js/KaTeX/sanitize
 * (按 CLAUDE.md "先跑 n=1 再抽象" — 真有场景再加)。
 *
 * @mention 字段走 token 后处理(避开 markdown 块级结构干扰),群消息时优先
 * 走 subscribers 查后端 enrich 后的 name(可能带 `(Nancy)` 后缀)。
 */
export function TextRenderer({ message }: TextRendererProps) {
  const content = message.content as MessageText;
  const text = content.text ?? "";
  const tokens = mentionTokens(content.mention, message.channel);
  return <Markdown content={text} tokens={tokens} />;
}
