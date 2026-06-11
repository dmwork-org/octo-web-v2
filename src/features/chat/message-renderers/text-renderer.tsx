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
  isLikelyRealUid,
  readMessageMention,
  type MentionWithFlags,
} from "@/features/chat/lib/read-message-mention";
import { parseThreadChannelId } from "@/features/base/im/parse-thread-channel-id";
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

/** 子区 channel type(对齐 dmworkbase Const.ts ChannelTypeCommunityTopic)。 */
const CHANNEL_TYPE_THREAD = 5;

/**
 * 收集 uid 在群/Person channelInfo 内**所有可能的显示名候选** — mention 高亮主路径。
 *   - 群 subscriber:remark / name / orgData.real_name / orgData.displayName
 *   - **子区**(channelType=5):解析出父群 groupNo,查父群 subscribers(本身没 sub 列表)
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
  // 群 / 子区(走父群)的 subscriber 列表
  let groupChannel: Channel | null = null;
  if (channel.channelType === ChannelTypeGroup) {
    groupChannel = channel;
  } else if (channel.channelType === CHANNEL_TYPE_THREAD) {
    const parsed = parseThreadChannelId(channel.channelID);
    if (parsed) {
      groupChannel = new Channel(parsed.groupNo, ChannelTypeGroup);
    }
  }
  if (groupChannel) {
    const sub = WKSDK.shared()
      .channelManager.getSubscribes(groupChannel)
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
 * Reverse lookup:从群/子区 subscribers 找 `name === target` 的 sub 的真 uid。
 *
 * **issue #85** 配套 — bot 消息 mention.entities[i].uid 填占位 "uid",chip
 * 默认渲染成不可点击形态。这里尝试从 text 里 entity 圈出的 displayName
 * (`text.slice(offset+1, end)` 去掉前导 @)反查群成员的真 uid,让 chip 可点击
 * (跳 UserInfoModal / BotDetailModal)。
 *
 * 反查命中条件宽:sub.name / sub.remark / orgData.real_name / orgData.displayName
 * 任一相等即返回。私聊 channel 无 subscribers,直接 undefined。
 */
function lookupUidByDisplayName(channel: Channel, name: string): string | undefined {
  let groupChannel: Channel | null = null;
  if (channel.channelType === ChannelTypeGroup) {
    groupChannel = channel;
  } else if (channel.channelType === CHANNEL_TYPE_THREAD) {
    const parsed = parseThreadChannelId(channel.channelID);
    if (parsed) groupChannel = new Channel(parsed.groupNo, ChannelTypeGroup);
  }
  if (!groupChannel) return undefined;
  const subs = WKSDK.shared().channelManager.getSubscribes(groupChannel);
  if (!subs) return undefined;
  for (const s of subs) {
    if (s.name === name || s.remark === name) return s.uid;
    const org = s.orgData as { real_name?: string; displayName?: string } | undefined;
    if (org?.real_name === name || org?.displayName === name) return s.uid;
  }
  return undefined;
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
  mention: Mention | undefined,
  channel: Channel,
): MarkdownToken[] {
  if (!mention) return [];
  const flags = mention as MentionWithFlags;
  if (
    !mention.uids?.length &&
    !mention.all &&
    !flags.humans &&
    !flags.ais &&
    !flags.entities?.length
  ) {
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
  // entity 优先(bot 消息有 offset/length,无需 candidate 反查)
  if (flags.entities && flags.entities.length > 0) {
    const seenNeedles = new Set<string>();
    for (const ent of flags.entities) {
      const needle = text.slice(ent.offset, ent.offset + ent.length);
      if (!needle.startsWith("@")) continue;
      if (seenNeedles.has(needle)) continue;
      seenNeedles.add(needle);
      const displayName = needle.slice(1);
      // entity.uid 可能是占位 "uid"(bot 后端 #85);先用真 uid,否则反查
      const realUid = isLikelyRealUid(ent.uid)
        ? ent.uid
        : lookupUidByDisplayName(channel, displayName);
      tokens.push({
        match: needle,
        render: (key) => (
          <MentionTag key={key} sourceChannel={channel} uid={realUid}>
            {needle}
          </MentionTag>
        ),
      });
    }
    return tokens;
  }
  // 主路径 — candidate names 精确匹配(支持空格 / 特殊字符 / 防文字误绑)
  const uids = mention.uids ?? [];
  for (const uid of uids) {
    const names = collectCandidateNames(uid, channel);
    if (names.length === 0) {
      // candidate 拉不到就不高亮(退化为普通文本) — 不再 fetch Person channelInfo
      // 兜底(issue #84):真 uid 通常已被 message-row / subscribers cache 覆盖,
      // 脏数据 uid(如 "utility")fetch 永远 400 反而触发"用户信息不存在"toast。
      continue;
    }
    // 按长度升序排序 — 短名优先匹配,避免长 candidate(如 displayName 设成
    // "李志伟测试测试测试")吞掉用户在 mention 后输入的普通文字(issue #73)
    for (const name of names.slice().sort((a, b) => a.length - b.length)) {
      const match = `@${name}`;
      if (text.includes(match)) {
        tokens.push({
          match,
          render: (key) => (
            <MentionTag key={key} sourceChannel={channel} uid={uid}>
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

  const tokens = [
    ...mentionTokens(text, readMessageMention(content), message.channel),
    ...emojiTokens(text),
  ];
  return <Markdown content={text} tokens={tokens} />;
}
