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
import { useChannelInfoTick } from "@/features/chat/hooks/use-channel-info-tick.hook";
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
 * 收集 uid 在群/Person channelInfo 内**所有可能的显示名候选** — mention 高亮主路径。
 *   - 群 subscriber:remark / name / orgData.real_name / orgData.displayName
 *   - Person channelInfo:title / orgData.remark / orgData.real_name / orgData.displayName
 *
 * 旧仓 mention 走 `message.parts`(SDK 把 text + uid 解析配对);新仓没这数据,
 * 必须靠 candidate name 在 text 里精确匹配。多候选覆盖各种 name 写法。
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
 * **主路径(candidates)**:每个 uid 用 collectCandidateNames 取真实显示名,
 * 拼 `@<name>` 在 text 里 `includes` 精确匹配。命中即注册 token。
 *   - 优点 1:支持带空格 / 特殊字符的真实显示名(如 `@新Octo Bug 收集`),
 *     正则字符类搞不定的 case 全靠这条
 *   - 优点 2:**不会误绑文字里的字面 @ 串**(如 `@我点不掉` 不是任何 uid 的
 *     candidate name → 不渲染),issue #46 真凶
 *
 * **cache race**:candidates 没拉到时主动 fetchChannelInfo,useChannelInfoTick
 * 监听到 channelInfo 变化触发 re-render,本函数重算 tokens 自动高亮。
 * **不走正则兜底** — 老仓 SDK 给 parts 精确边界,新仓没 parts 必须靠 candidate
 * 真名匹配。正则按文本顺序绑会误绑文字字面 @ 串。
 *
 * **全员/AI 关键字独立**:`@所有人` / `@all` / `@所有AI` 由 mention.all/humans/ais
 * 字段表达,不消耗 mention.uids 顺位。
 * - mention.ais=1 时 uids 是 routing bot uid(client expand 给 legacy adapter),
 *   不参与 candidate,fail-closed 防绑到 @ops 等裸 @text(上游 90556da2)
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
  if (flags.ais) {
    return tokens;
  }
  // 主路径 — candidate names 精确匹配(支持空格 / 特殊字符 / 防文字误绑)
  const uids = mention.uids ?? [];
  for (const uid of uids) {
    const names = collectCandidateNames(uid, channel);
    if (names.length === 0) {
      // candidates cache 没拉到 — 主动触发 Person channelInfo fetch,
      // channelInfo 到位后 useChannelInfoTick 触发 re-render,本函数重算 tokens
      void WKSDK.shared().channelManager.fetchChannelInfo(new Channel(uid, ChannelTypePerson));
      continue;
    }
    for (const name of names) {
      const match = `@${name}`;
      if (text.includes(match)) {
        tokens.push({
          match,
          render: (key) => (
            <MentionTag key={key} uid={uid}>
              {match}
            </MentionTag>
          ),
        });
        break;
      }
    }
  }
  // **不走正则兜底** — 老仓 SDK 给 parts 精确边界,新仓没 parts 必须靠 candidate
  // 真名匹配。正则按文本顺序绑会把"@我点不掉"等文字字面 @ 串误绑给 uids[0]
  // (issue #46 真凶)。candidates cache race 时宁可暂时不高亮 — channelInfo
  // 到位后 useChannelInfoTick → re-render → 重算 → 高亮自动出现。
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

  const tokens = [...mentionTokens(text, content.mention, message.channel), ...emojiTokens(text)];
  return <Markdown content={text} tokens={tokens} />;
}
