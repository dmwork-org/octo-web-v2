import type { ReactNode } from "react";
import WKSDK, { Channel, ChannelTypeGroup, ChannelTypePerson, type Mention } from "wukongimjssdk";
import { openChatProfile } from "@/features/chat/lib/open-profile";
import { useChannelInfoTick } from "@/features/chat/hooks/use-channel-info-tick.hook";
import { isFetchableUid } from "@/features/chat/lib/read-message-mention";
import { parseThreadChannelId } from "@/features/base/im/parse-thread-channel-id";

/** SDK Mention 缺 humans/ais 三态字段类型,本地补;运行时由 send-content-proxy 注入。 */
type MentionWithFlags = Mention & { humans?: number; ais?: number };

/** 子区 channel type(对齐 dmworkbase Const.ts ChannelTypeCommunityTopic)。 */
const CHANNEL_TYPE_THREAD = 5;

const richTextLinkRe = /\b(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;
const trailingLinkPunctuation = new Set([
  ".",
  ",",
  "!",
  "?",
  ";",
  ":",
  "，",
  "。",
  "！",
  "？",
  "；",
  "：",
  "、",
  ")",
  "）",
  "]",
  "】",
  "}",
  "》",
  "」",
  "』",
]);

/**
 * 收集 uid 在群/Person channelInfo 内**所有可能的显示名候选**(跟 text-renderer
 * collectCandidateNames 同款,本地副本未抽公共)。
 */
function collectCandidateNames(uid: string, channel: Channel): string[] {
  const names: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === "string" && v.length > 0 && !names.includes(v)) names.push(v);
  };
  // 群 / 子区(走父群)的 subscriber 列表 — 子区本身无 sub 列表,必须解析父群(issue #73 真凶)
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
 * @ 提及高亮 tag(对应旧 dmworkbase Messages/Text MarkdownContent mention):
 * brand 色文本 + 浅 brand 底胶囊。**@所有人 / @AI 也走同款胶囊样式**
 * (对齐老仓 mentionRenderState 的 mention-entity 类),区别仅在 interactive=false。
 * uid 非空时 click 弹 UserInfoModal / BotDetailModal(经 openChatProfile 判 bot)。
 */
export function MentionTag({
  children,
  isAll,
  uid,
}: {
  children: string;
  isAll?: boolean;
  uid?: string;
}) {
  const clickable = !isAll && !!uid;
  const base = "inline-flex items-center rounded-[4px] px-2 py-[2px] font-medium text-[#6B3DD8]";
  if (!clickable) {
    return <span className={`${base} bg-[rgba(107,61,216,0.08)]`}>{children}</span>;
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

function trimTrailingLinkPunctuation(raw: string): string {
  let end = raw.length;
  while (end > 0 && trailingLinkPunctuation.has(raw[end - 1] ?? "")) {
    end--;
  }
  return raw.slice(0, end);
}

function toSafeExternalHref(raw: string): string | null {
  const href = raw.toLowerCase().startsWith("www.") ? `https://${raw}` : raw;
  try {
    const url = new URL(href);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.href;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Plain text 渲染,把 @ 匹配段 + 安全外链替换为对应节点(对齐 text-renderer
 * mentionTokens 主路径)。
 *
 * **使用场景**:RichText=14 text block 需要在不走 markdown 解析的前提下高亮 @
 * 和外链,跟 text-renderer 的 mention 行为保持一致。
 *
 * **@匹配策略**(issue #46):
 *   1. 主路径 — candidate names 精确匹配:每个 uid 用 collectCandidateNames 取
 *      真实显示名,`@<name>` 在 text 里 indexOf 匹配。支持带空格 / 特殊字符
 *      的名字(如 `@新Octo Bug 收集`),且不会误绑 text 里字面 @ 串
 *   2. 兜底 — 正则按序绑剩余未匹配 uid(缓存 race 或用户写法跟 candidate 不一致)
 *      不绑;cache miss 时主动 fetchChannelInfo 触发拉取,useChannelInfoTick
 *      监听到 channelInfo 变化触发 re-render,本函数重算 hits
 *
 * **linkify**(上游 #67):linkify=true 时额外把 http(s) / www URL 渲染为安全
 * 外链 `<a>`,过滤 javascript: / data: 等危险协议;mention 命中位置在 linkRanges
 * 内时跳过(避免链接里的 `@` 字符当 mention)。
 *
 * **全员/AI**:
 *   - mention.all   → @所有人 / @all 高亮
 *   - mention.humans→ @所有人 高亮(broadcast)
 *   - mention.ais   → @所有AI 高亮(broadcast,uids 视为 routing 不绑文本)
 */
export function MentionAwareText({
  text,
  mention,
  channel,
  linkify = false,
}: {
  text: string;
  mention?: Mention;
  channel?: Channel;
  linkify?: boolean;
}) {
  // 订阅全局 channelInfo 变化 — cache race 时主路径会触发 fetch,到位后重渲。
  // 必须在所有早返回之前调,遵守 React Rules of Hooks。
  useChannelInfoTick();
  if (!text) return <>{text}</>;

  type Hit = { start: number; end: number; node: ReactNode };
  const hits: Hit[] = [];
  const linkRanges: { start: number; end: number }[] = [];
  const isInsideLink = (pos: number) => linkRanges.some((r) => pos >= r.start && pos < r.end);

  if (linkify) {
    richTextLinkRe.lastIndex = 0;
    for (const m of text.matchAll(richTextLinkRe)) {
      const start = m.index ?? -1;
      if (start === -1) continue;
      const label = trimTrailingLinkPunctuation(m[0]);
      if (!label) continue;
      const href = toSafeExternalHref(label);
      if (!href) continue;
      const end = start + label.length;
      linkRanges.push({ start, end });
      hits.push({
        start,
        end,
        node: (
          <a
            key={`tk-link-${start}`}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-text-accent underline underline-offset-2 transition-opacity hover:opacity-80"
          >
            {label}
          </a>
        ),
      });
    }
  }

  if (mention) {
    const flags = mention as MentionWithFlags;
    const hasMentionTargets =
      !!mention.uids?.length || !!mention.all || !!flags.humans || !!flags.ais;

    if (hasMentionTargets) {
      const pushAllOccurrences = (needle: string, render: (key: string) => ReactNode) => {
        if (!needle) return;
        let from = 0;
        let n = 0;
        while (true) {
          const idx = text.indexOf(needle, from);
          if (idx === -1) break;
          if (!isInsideLink(idx)) {
            hits.push({
              start: idx,
              end: idx + needle.length,
              node: render(`tk-${needle}-${n++}`),
            });
          }
          from = idx + needle.length;
        }
      };

      if (mention.all) {
        pushAllOccurrences("@所有人", (k) => (
          <MentionTag key={k} isAll>
            @所有人
          </MentionTag>
        ));
        pushAllOccurrences("@all", (k) => (
          <MentionTag key={k} isAll>
            @all
          </MentionTag>
        ));
      }
      if (flags.humans) {
        pushAllOccurrences("@所有人", (k) => (
          <MentionTag key={k} isAll>
            @所有人
          </MentionTag>
        ));
      }
      if (flags.ais) {
        pushAllOccurrences("@所有AI", (k) => (
          <MentionTag key={k} isAll>
            @所有AI
          </MentionTag>
        ));
        // ais=1 时 uids 是 routing bot,不绑文本(fail-closed,对齐 text-renderer)
      } else {
        const uids = mention.uids ?? [];
        // 主路径 — candidate names 精确匹配(需要 channel)。生产消息都带 channel,
        // 避免把普通 @ 文本误绑给 uids[0](issue #46 真凶)。
        if (channel) {
          for (const uid of uids) {
            const names = collectCandidateNames(uid, channel);
            if (names.length === 0) {
              // 非法 uid 跳过避免 toast 风暴(issue #74);SDK 内部 promise
              // 去重保证不重复 HTTP,失败不 blacklist 让下次自然重试(issue #73 followup)
              if (isFetchableUid(uid)) {
                void WKSDK.shared().channelManager.fetchChannelInfo(
                  new Channel(uid, ChannelTypePerson),
                );
              }
              continue;
            }
            let found = false;
            // 按长度升序 — 短名优先匹配,避免长 candidate 吞掉 mention 后的
            // 普通文字(issue #73 `@李志伟测试测试测试` 多余高亮)
            for (const name of names.slice().sort((a, b) => a.length - b.length)) {
              const needle = `@${name}`;
              let from = 0;
              while (from < text.length) {
                const idx = text.indexOf(needle, from);
                if (idx === -1) break;
                if (isInsideLink(idx)) {
                  from = idx + 1;
                  continue;
                }
                const overlap = hits.some((h) => idx < h.end && idx + needle.length > h.start);
                if (!overlap) {
                  hits.push({
                    start: idx,
                    end: idx + needle.length,
                    node: (
                      <MentionTag key={`tk-uid-${uid}-${idx}`} uid={uid}>
                        {needle}
                      </MentionTag>
                    ),
                  });
                  found = true;
                  break;
                }
                from = idx + 1;
              }
              if (found) break;
            }
          }
        } else {
          // 无 channel 的调用无法查候选名,只能按文本顺序兜底;链接内的 @ 不消耗 uid。
          const re = /@[\p{Script=Han}A-Za-z][\p{Script=Han}\w.()（）-]{0,29}/gu;
          let i = 0;
          for (const m of text.matchAll(re)) {
            if (i >= uids.length) break;
            const match = m[0];
            const start = m.index ?? -1;
            if (start === -1 || isInsideLink(start)) continue;
            const overlap = hits.some((h) => start < h.end && start + match.length > h.start);
            if (overlap) continue;
            const uid = uids[i++];
            hits.push({
              start,
              end: start + match.length,
              node: (
                <MentionTag key={`tk-uid-${uid}-${start}`} uid={uid}>
                  {match}
                </MentionTag>
              ),
            });
          }
        }
      }
    }
  }

  if (hits.length === 0) return <>{text}</>;
  // 按 start 排序,去重叠(broadcast 通常在前,先注册先生效)
  hits.sort((a, b) => a.start - b.start);
  const dedup: Hit[] = [];
  let cursor = 0;
  for (const h of hits) {
    if (h.start < cursor) continue;
    dedup.push(h);
    cursor = h.end;
  }

  const out: ReactNode[] = [];
  let pos = 0;
  for (const h of dedup) {
    if (h.start > pos) out.push(text.slice(pos, h.start));
    out.push(h.node);
    pos = h.end;
  }
  if (pos < text.length) out.push(text.slice(pos));
  return <>{out}</>;
}
