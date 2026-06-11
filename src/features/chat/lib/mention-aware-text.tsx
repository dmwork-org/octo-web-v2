import type { ReactNode } from "react";
import type { Mention } from "wukongimjssdk";
import { openChatProfile } from "@/features/chat/lib/open-profile";

/** SDK Mention 缺 humans/ais 三态字段类型,本地补;运行时由 send-content-proxy 注入。 */
type MentionWithFlags = Mention & { humans?: number; ais?: number };

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
 * brand 色文本 + 浅 brand 底胶囊,@all 用纯 brand 色无背景。
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
 * Plain text 渲染,把 @ 匹配段替换为 MentionTag(对齐 text-renderer mentionTokens 主路径)。
 * linkify=true 时额外把 http(s) / www URL 渲染为安全外链,但仍不启用 Markdown。
 *
 * **使用场景**:RichText=14 text block 需要在不走 markdown 解析的前提下高亮 @,
 * 跟 text-renderer 的 mention 行为保持一致。逻辑:
 *   - mention.all   → @所有人 / @all 高亮
 *   - mention.humans→ @所有人 高亮(broadcast)
 *   - mention.ais   → @所有AI 高亮(broadcast,uids 视为 routing,不绑文本)
 *   - 否则按 uids 一一对应高亮 text 里的 @xxx
 */
export function MentionAwareText({
  text,
  mention,
  linkify = false,
}: {
  text: string;
  mention?: Mention;
  linkify?: boolean;
}) {
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

  if (!mention) {
    if (hits.length === 0) return <>{text}</>;
  } else {
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
        // eslint-disable-next-line no-misleading-character-class
        const re = /@[一-龥a-zA-Z][一-龥\w\-.()()]{0,29}/g;
        const uids = mention.uids ?? [];
        let i = 0;
        for (const m of text.matchAll(re)) {
          if (i >= uids.length) break;
          const match = m[0];
          const start = m.index ?? -1;
          if (start === -1) {
            i++;
            continue;
          }
          if (isInsideLink(start)) continue;
          const uid = uids[i++];
          hits.push({
            start,
            end: start + match.length,
            node: (
              <MentionTag key={`tk-uid-${start}`} uid={uid}>
                {match}
              </MentionTag>
            ),
          });
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
