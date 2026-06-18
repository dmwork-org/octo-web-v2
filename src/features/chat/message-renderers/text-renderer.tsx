import { Channel, type Message, type MessageText } from "wukongimjssdk";
import { openChatProfile } from "@/features/chat/lib/open-profile";
import { Markdown, type MarkdownToken } from "@/components/ui/markdown";
import { useChannelInfoTick } from "@/features/chat/hooks/use-channel-info-tick.hook";
import { readMessageMention } from "@/features/chat/lib/read-message-mention";
import { resolveMentionTextTargets } from "@/features/chat/lib/mention-text-resolver";
import {
  findEmojiKeywords,
  getEmojiImageUrl,
  getSingleCustomEmoji,
} from "@/features/base/emoji/emoji-data";

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
  // **@所有人 / @AI 也走同款胶囊样式**(对齐老仓 mentionRenderState 的 mention-entity 类),
  // 区别仅在 interactive=false(不可点击 → 渲染 span 而非 button)。
  const base = "inline-flex items-center rounded-[4px] px-2 py-[2px] font-medium text-[#6B3DD8]";
  if (!clickable) {
    return <span className={`${base} bg-[rgba(107,61,216,0.08)]`}>{children}</span>;
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
 * mention 字段 → Markdown tokens(供 `<Markdown>` 后处理替换):
 *
 * **entity 优先**(issue #85,适配 bot 消息):若 mention.contentObj 带
 * `entities[{offset,length,uid}]`(wukong IM 协议的 mention range,类似
 * Telegram MessageEntity),直接用 `text.slice(offset, offset+length)` 作 needle
 * 注册 token。bot 后端通常按规范填 entities 给精确位置,但 entity.uid 可能
 * 是占位 "uid" — chip 用 lookupUidByDisplayName 反查群成员,反查不到就渲染
 * 不可点击 chip。**entity 路径独占** — 不再走 uids candidate,避免双重 token。
 *
 * **uids candidate 主路径**(用户消息):没 entities 时,每个 uid 用
 * collectCandidateNames 取真实显示名,拼 `@<name>` 在 text 里 `includes`
 * 精确匹配。命中即注册 token。
 *   - 优点 1:支持带空格 / 特殊字符的真实显示名(如 `@新Octo Bug 收集`),
 *     正则字符类搞不定的 case 全靠这条
 *   - 优点 2:**不会误绑文字里的字面 @ 串**(如 `@我点不掉` 不是任何 uid 的
 *     candidate name → 不渲染),issue #46 真凶
 *
 * **cache race**:candidates 没拉到就不高亮(退化为普通文本),不再 fetch
 * 兜底(issue #84 移除,fetch 风暴 + "用户信息不存在" toast)。
 * **不走正则兜底** — 老仓 SDK 给 parts 精确边界,新仓没 parts 必须靠
 * candidate 真名 / entity 范围匹配。正则按文本顺序绑会误绑文字字面 @ 串。
 *
 * **全员/AI 关键字独立**:`@所有人` / `@all` / `@所有AI` 由 mention.all/humans/ais
 * 字段表达,不消耗 mention.uids 顺位。
 * - mention.ais=1 时 uids 是 routing bot uid(client expand 给 legacy adapter),
 *   不参与 candidate,fail-closed 防绑到 @ops 等裸 @text(上游 90556da2)
 */
function mentionTokens(
  text: string,
  mention: ReturnType<typeof readMessageMention>,
  channel: Channel,
): MarkdownToken[] {
  return resolveMentionTextTargets({ text, mention, channel }).map((target) => ({
    match: target.needle,
    render: (key) => (
      <MentionTag key={key} isAll={target.isAll} sourceChannel={channel} uid={target.uid}>
        {target.needle}
      </MentionTag>
    ),
  }));
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
  // 订阅全局 channelInfo 变化 — mention candidate 来自 channelInfo/subscribers,
  // cache race 时主路径没匹配,主动 fetchChannelInfo 后到位时重渲就能正确高亮
  useChannelInfoTick();

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

  const tokens = [
    ...mentionTokens(text, readMessageMention(content), message.channel),
    ...emojiTokens(text),
  ];
  return <Markdown content={text} tokens={tokens} className="select-text" />;
}
