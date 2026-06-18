import { useEffect, useRef, type ReactNode } from "react";
import WKSDK, { Channel, ChannelTypePerson, type Mention } from "wukongimjssdk";
import { openChatProfile } from "@/features/chat/lib/open-profile";
import { useChannelInfoTick } from "@/features/chat/hooks/use-channel-info-tick.hook";
import { isLikelyRealUid, type MentionWithFlags } from "@/features/chat/lib/read-message-mention";
import {
  collectMentionCandidateNames,
  resolveMentionTextTargets,
  type MentionTextTarget,
} from "@/features/chat/lib/mention-text-resolver";

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
 * **@匹配策略**:
 *   1. **entity 优先**(issue #85,bot 消息):`mention.contentObj.entities`
 *      给精确 `{offset,length,uid}` 范围,直接 `text.slice` 圈定 mention chip。
 *      entity.uid 是占位 "uid" 时反查群成员让 chip 可点击。entity 路径独占,
 *      不再走 uids candidate。
 *   2. **candidate names 精确匹配**(用户消息,issue #46):没 entities 时
 *      每个 uid 用 collectCandidateNames 取真实显示名,`@<name>` 在 text
 *      `indexOf` 匹配。支持带空格 / 特殊字符的名字(如 `@新Octo Bug 收集`)。
 *      candidate cache miss 不再 fetch 兜底(issue #84),退化为不高亮。
 *   3. **无 channel 兜底**:正则按序绑剩余 uid(仅 RichText 无 channel
 *      调用场景,生产消息都带 channel)。
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
  // #124: 当 mention.uids 存在但 candidate names 为空时,主动 fetch Person channelInfo。
  // SDK cache race(首次进入/刷新)时 subscribers 可能还没到位,getSubscribes 返回空。
  // fetchChannelInfo 成功后 SDK 触发 channelInfoListener → useChannelInfoTick → 重渲 → candidate 到位 → 高亮。
  useFetchMissingMentionCandidates(mention, channel);
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
      !!mention.uids?.length ||
      !!mention.all ||
      !!flags.humans ||
      !!flags.ais ||
      !!flags.entities?.length;

    if (hasMentionTargets) {
      const pushTarget = (target: MentionTextTarget) => {
        const render = (key: string) => (
          <MentionTag key={key} isAll={target.isAll} uid={target.uid}>
            {target.needle}
          </MentionTag>
        );
        const start = target.start;
        if (start != null) {
          if (isInsideLink(start)) return;
          const overlap = hits.some((h) => start < h.end && start + target.needle.length > h.start);
          if (overlap) return;
          hits.push({
            start,
            end: start + target.needle.length,
            node: render(`tk-mention-${start}`),
          });
          return;
        }
        if (target.matchAll) {
          pushAllOccurrences(target.needle, render);
          return;
        }
        const idx = findAvailableIndex(text, target.needle, hits, isInsideLink);
        if (idx === -1) return;
        hits.push({
          start: idx,
          end: idx + target.needle.length,
          node: render(`tk-mention-${idx}`),
        });
      };

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
      for (const target of resolveMentionTextTargets({
        text,
        mention,
        channel,
        allowRegexFallback: true,
        blockedRanges: linkRanges,
      })) {
        pushTarget(target);
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

function findAvailableIndex(
  text: string,
  needle: string,
  hits: { start: number; end: number }[],
  isInsideLink: (pos: number) => boolean,
): number {
  let from = 0;
  while (from < text.length) {
    const idx = text.indexOf(needle, from);
    if (idx === -1) return -1;
    const end = idx + needle.length;
    if (!isInsideLink(idx) && !hits.some((h) => idx < h.end && end > h.start)) {
      return idx;
    }
    from = idx + 1;
  }
  return -1;
}

/**
 * #124: 主动为 mention.uids 中 candidate 为空的 uid fetch Person channelInfo。
 *
 * 首次进入/刷新时 SDK subscribers cache 可能还没到位,getSubscribes 返回空。
 * 这导致 collectCandidateNames 返回空 → @不高亮 → 等 useChannelInfoTick 重渲。
 * 但如果 channelManager 没发出通知(已到位但未通知),tick 永远不触发。
 *
 * 本 hook 遍历 mention.uids,对 candidate 为空但 uid 看起来合法的,主动调
 * fetchChannelInfo。fetch 成功后 SDK 触发 listener → tick → 重渲 → candidate
 * 到位 → @高亮。每个 uid 只 fetch 一次(ref 追踪)。
 */
function useFetchMissingMentionCandidates(
  mention: Mention | undefined,
  channel: Channel | undefined,
): void {
  const fetchedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!mention?.uids?.length || !channel) return;
    const flags = mention as MentionWithFlags;
    // entity 路径不需要 candidate;ais 路径 uids 是 routing 不绑文本
    if (flags.entities?.length || flags.ais) return;

    for (const uid of mention.uids) {
      if (!isLikelyRealUid(uid)) continue;
      if (fetchedRef.current.has(uid)) continue;
      const names = collectMentionCandidateNames(uid, channel);
      if (names.length > 0) continue; // candidate 已有,无需 fetch
      // 标记为已 fetch,避免重复
      fetchedRef.current.add(uid);
      // 主动 fetch Person channelInfo — 成功后 SDK 触发 listener → tick → 重渲
      void WKSDK.shared().channelManager.fetchChannelInfo(new Channel(uid, ChannelTypePerson));
    }
  });
}
