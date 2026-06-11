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
import {
  findEmojiKeywords,
  getEmojiImageUrl,
  getSingleCustomEmoji,
} from "@/features/base/emoji/emoji-data";

/** SDK Mention 缺 humans/ais 三态字段类型,本地补;运行时由 send-content-proxy 注入。 */
type MentionWithFlags = Mention & { humans?: number; ais?: number };

interface TextRendererProps {
  message: Message;
}

/**
 * @ 提及高亮 tag(对应旧 dmworkbase Messages/Text MarkdownContent mention):
 * brand 色文本 + 浅 brand 底胶囊,@all 用纯 brand 色无背景。
 * uid 非空时 click 弹 UserInfoModal / BotDetailModal(经 openChatProfile 判 bot)。
 */
function MentionTag({
  children,
  isAll,
  sourceChannel,
  uid,
}: {
  children: string;
  isAll?: boolean;
  sourceChannel?: Channel;
  uid?: string;
}) {
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
        openChatProfile(uid, sourceChannel);
      }}
      className={`${base} cursor-pointer bg-[rgba(107,61,216,0.08)] hover:bg-[rgba(107,61,216,0.12)]`}
    >
      {children}
    </button>
  );
}

/**
 * Inline emoji 图(对齐旧 .wk-message-text-richemoji img 18×18 + vertical-align: sub)。
 * src 来自 `public/emoji/<key>.png`,小图嵌入文本流,跟字符基线对齐。
 */
function EmojiImg({ keyword }: { keyword: string }) {
  const url = getEmojiImageUrl(keyword);
  if (!url) return <span>{keyword}</span>;
  return (
    <img
      src={url}
      alt={keyword}
      className="inline-block h-[18px] w-[18px] align-sub"
      draggable={false}
    />
  );
}

/**
 * 从 text 正则提取所有 `@xxx`,按出现顺序对应 mention.uids[i] — 主路径。
 *
 * **背景**:同一 uid 在 text 里可能是中文名 / 英文 username / remark,
 * channelInfo/subscriber 缓存里的候选可能全部不匹配(刘会燕场景:sub.name 和
 * channelInfo.title 都是 "liuhuiyan",但 text 里写的是 "@刘会燕")。
 *
 * 主路径:正则匹配 text 里所有 `@xxx`(以中文/字母开头),按出现顺序跟
 * mention.uids 一一对应 — 发送端 input 插 mention 时是按顺序填入 uids,
 * i 对应不会错位。
 *
 * 正则:`@[一-龥a-zA-Z][一-龥\w\-.()()]{0,29}` — 必须首字符是中文或字母,
 * 避免 "@123" / "@-x" 误识别;不包含空白/中文标点,保证 mention 边界。
 */
function extractAtSpansFromText(text: string, uids: string[]): { match: string; uid: string }[] {
  if (!text || uids.length === 0) return [];
  // eslint-disable-next-line no-misleading-character-class
  const re = /@[一-龥a-zA-Z][一-龥\w\-.()()]{0,29}/g;
  const out: { match: string; uid: string }[] = [];
  let i = 0;
  for (const m of text.matchAll(re)) {
    if (i >= uids.length) break;
    out.push({ match: m[0], uid: uids[i++] });
  }
  return out;
}

/**
 * 收集 uid 在群/Person channelInfo 内**所有可能的显示名候选** — 兜底路径。
 *   - 群 subscriber:remark / name / orgData.real_name / orgData.displayName
 *   - Person channelInfo:title / orgData.remark / orgData.real_name / orgData.displayName
 *
 * 旧仓 mention 走 `message.parts`(SDK 把 text + uid 解析配对);新仓没这数据,
 * 必须靠文本匹配。多候选覆盖各种 name 写法。
 */
function collectCandidateNames(uid: string, channel: Channel): string[] {
  const names: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === "string" && v.length > 0 && !names.includes(v)) names.push(v);
  };
  if (channel.channelType === ChannelTypeGroup) {
    const sub = WKSDK.shared()
      .channelManager.getSubscribes(channel)
      ?.find((s) => s.uid === uid);
    push(sub?.remark);
    push(sub?.name);
    const subOrg = sub?.orgData as { real_name?: string; displayName?: string } | undefined;
    push(subOrg?.real_name);
    push(subOrg?.displayName);
  }
  const info = WKSDK.shared().channelManager.getChannelInfo(new Channel(uid, ChannelTypePerson));
  push(info?.title);
  const infoOrg = info?.orgData as
    | { remark?: string; real_name?: string; displayName?: string }
    | undefined;
  push(infoOrg?.remark);
  push(infoOrg?.real_name);
  push(infoOrg?.displayName);
  return names;
}

/**
 * mention 字段 → Markdown tokens(供 `<Markdown>` 后处理替换):
 *
 * 双路径(主路径 + 兜底):
 *   1. 正则提取 text 里所有 `@xxx`,按顺序对应 mention.uids — 主路径,
 *      不依赖任何缓存,只要 text 里 @ 模式可识别就能高亮
 *   2. 候选 name token:为每个 uid 收集所有候选 name,作为额外保险
 *      (text 里 mention 后紧接特殊字符,正则边界没覆盖的 case 仍能匹配)
 *
 * - mention.all=true 时额外加 "@所有人" / "@all" token(legacy)
 * - mention.humans=1 时加 "@所有人" broadcast token(新三态,上游 76189c1d)
 * - mention.ais=1 时加 "@所有AI" broadcast token,且 uids 视为 routing
 *   bot uid(不参与 text 主路径/兜底匹配,避免误绑到裸写 @xxx;上游 90556da2
 *   fail-closed guard)
 * - 不解析任意 `@<word>`(避免误识别邮件/字面值),只信任 mention 字段
 */
function mentionTokens(
  text: string,
  mention: Mention | undefined,
  channel: Channel,
): MarkdownToken[] {
  if (!mention) return [];
  const flags = mention as MentionWithFlags;
  if (!mention.uids?.length && !mention.all && !flags.humans && !flags.ais) {
    return [];
  }
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
  if (flags.humans) {
    tokens.push({
      match: "@所有人",
      render: (key) => (
        <MentionTag key={key} isAll>
          @所有人
        </MentionTag>
      ),
    });
  }
  if (flags.ais) {
    tokens.push({
      match: "@所有AI",
      render: (key) => (
        <MentionTag key={key} isAll>
          @所有AI
        </MentionTag>
      ),
    });
  }
  // mention.ais=1 时 uids 是 routing bot uid(client 端 expand 进去给 legacy
  // adapter bot 收到的,不是用户面 mention),不能绑给文本里的 @xxx —— 否则会
  // 把 routing uid 绑给 @所有AI 之外的 @ops 等裸 @text。fail-closed guard。
  if (flags.ais) {
    return tokens;
  }
  // 主路径:正则提取
  for (const { match, uid } of extractAtSpansFromText(text, mention.uids ?? [])) {
    tokens.push({
      match,
      render: (key) => (
        <MentionTag key={key} sourceChannel={channel} uid={uid}>
          {match}
        </MentionTag>
      ),
    });
  }
  // 兜底:候选 names
  for (const uid of mention.uids ?? []) {
    for (const name of collectCandidateNames(uid, channel)) {
      const match = `@${name}`;
      tokens.push({
        match,
        render: (key) => (
          <MentionTag key={key} sourceChannel={channel} uid={uid}>
            {match}
          </MentionTag>
        ),
      });
    }
  }
  return tokens;
}

/**
 * Emoji 字段 → Markdown tokens:扫 text 里**出现过**的 keyword
 * (`[使命必达]` / `😀` / unicode emoji 序列),替换成 `<EmojiImg>`。
 * 对齐旧 EmojiService + MarkdownContent emoji parts(`./emoji/<key>.png`)。
 */
function emojiTokens(text: string): MarkdownToken[] {
  const keywords = findEmojiKeywords(text);
  return keywords.map((kw) => ({
    match: kw,
    render: (key) => <EmojiImg key={key} keyword={kw} />,
  }));
}

/**
 * 文本消息正文 — markdown 渲染 + @mention 高亮 + emoji 替换(M1)。
 *
 * 对应旧 dmworkbase Messages/Text/MarkdownContent.tsx(404 行) 的精简版:
 * 只保留 react-markdown + remark-gfm + remark-breaks,不引入 highlight.js/KaTeX/sanitize。
 *
 * **特殊**:全文本 trim 后仅含 1 个 custom_ keyword → 大图 120×120
 * (对齐旧 isLargeCustomEmoji),不走 Markdown。
 *
 * @mention 字段走 token 后处理 — 主路径正则提取 text 里 @xxx 按顺序对应
 * uids;兜底用 subscriber / channelInfo 多候选 name 匹配。
 *
 * emoji 走全局 keyword 扫描 token — 不依赖 parts 字段,直接对 text 匹配 152 keyword。
 */
export function TextRenderer({ message }: TextRendererProps) {
  const content = message.content as MessageText;
  const text = content.text ?? "";

  // 单独一个 custom emoji → 大图(120×120),跳过 markdown
  const largeCustom = getSingleCustomEmoji(text);
  if (largeCustom) {
    const url = getEmojiImageUrl(largeCustom);
    return (
      <span className="inline-block">
        <img src={url} alt={largeCustom} className="h-[120px] w-[120px]" draggable={false} />
      </span>
    );
  }

  const tokens = [...mentionTokens(text, content.mention, message.channel), ...emojiTokens(text)];
  return <Markdown content={text} tokens={tokens} />;
}
