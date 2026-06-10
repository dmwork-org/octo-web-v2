import { createContext, useCallback, useContext, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { visit } from "unist-util-visit";
import type { PluggableList, Plugin } from "unified";
import type { Node, Parent } from "unist";
import type { Root, Text } from "mdast";
import { Channel, ChannelTypeGroup, ChannelTypePerson } from "wukongimjssdk";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useT } from "@/lib/i18n/use-t";
import { t } from "@/lib/i18n/instance";
import { router } from "@/lib/router";
import { authStore } from "@/features/base/stores/auth";
import { chatLocateMessageActions } from "@/features/chat/stores/chat-locate-message";
import { chatSelectedActions } from "@/features/chat/stores/chat-selected";
import { summaryMarkdownClass } from "@/features/summary/components/summary-content";
import type { CitationContextMessage, CitationItem } from "@/features/summary/types/summary.types";

interface CitationTextProps {
  content: string;
  citations: CitationItem[];
}

interface CitationContextValue {
  activeKey: string | null;
  onBadgeClick: (key: string) => void;
  closeKey: (key: string) => void;
}

const CitationCtx = createContext<CitationContextValue>({
  activeKey: null,
  onBadgeClick: () => {},
  closeKey: () => {},
});

/**
 * 5 = ChannelTypeCommunityTopic(子区,SDK 未导出常量)
 * 旧后端:1=person, 5=topic, 其它走 group
 */
function resolveChannelType(channelType?: number): number {
  if (channelType === 1) return ChannelTypePerson;
  if (channelType === 5) return 5;
  return ChannelTypeGroup;
}

function formatCitationTime(iso: string): string {
  try {
    const d = new Date(iso);
    return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch {
    return iso;
  }
}

// ─── Remark 插件:把 [N] / [N][M] 文本节点转成 <citationgroup> ───

interface CitationNode extends Node {
  type: "citation";
  data: {
    hName: "citation";
    hProperties: { index: number; badgekey: string };
  };
}

interface CitationGroupNode extends Node {
  type: "citationgroup";
  data: {
    hName: "citationgroup";
    hProperties: { indices: string; badgekey: string };
  };
}

const remarkCitation: Plugin<[CitationItem[]], Root> = (citations) => {
  const getChannelId = (idx: number) => citations.find((c) => c.index === idx)?.channel_id;

  return (tree) => {
    let occurrence = 0;
    visit(tree, "text", (node: Text, index, parent: Parent | undefined) => {
      if (!parent || index === undefined) return;
      const regex = /\[(\d+)\](?!\()/g;
      const matches: { start: number; end: number; idx: number }[] = [];
      let m: RegExpExecArray | null;
      while ((m = regex.exec(node.value)) !== null) {
        matches.push({ start: m.index, end: m.index + m[0].length, idx: parseInt(m[1], 10) });
      }
      if (matches.length === 0) return;

      const groups: { start: number; end: number; indices: number[] }[] = [];
      let cur = {
        start: matches[0].start,
        end: matches[0].end,
        indices: [matches[0].idx],
      };
      for (let i = 1; i < matches.length; i++) {
        const prev = matches[i - 1];
        const cm = matches[i];
        const between = node.value.slice(prev.end, cm.start);
        const adjacent = between.trim() === "";
        const prevCh = getChannelId(prev.idx);
        const curCh = getChannelId(cm.idx);
        const sameCh = !!prevCh && !!curCh && prevCh === curCh;
        if (adjacent && sameCh) {
          cur.end = cm.end;
          cur.indices.push(cm.idx);
        } else {
          groups.push(cur);
          cur = { start: cm.start, end: cm.end, indices: [cm.idx] };
        }
      }
      groups.push(cur);

      const parts: (Text | CitationNode | CitationGroupNode)[] = [];
      let cursor = 0;
      for (const g of groups) {
        if (g.start > cursor) {
          parts.push({ type: "text", value: node.value.slice(cursor, g.start) });
        }
        const badgeKey = `${occurrence}-${g.indices.join(",")}`;
        occurrence += 1;
        if (g.indices.length === 1) {
          parts.push({
            type: "citation",
            data: {
              hName: "citation",
              hProperties: {
                index: g.indices[0],
                badgekey: badgeKey,
              },
            },
          });
        } else {
          parts.push({
            type: "citationgroup",
            data: {
              hName: "citationgroup",
              hProperties: {
                indices: g.indices.join(","),
                badgekey: badgeKey,
              },
            },
          });
        }
        cursor = g.end;
      }
      if (cursor < node.value.length) {
        parts.push({ type: "text", value: node.value.slice(cursor) });
      }

      parent.children.splice(index, 1, ...(parts as unknown as Parent["children"]));
      return index + parts.length;
    });
  };
};

// ─── Badge 视觉 ────────────────────────────────────────────

const badgeClass =
  "ml-0.5 inline-flex cursor-pointer items-center rounded-sm border border-border-subtle bg-bg-elevated px-1 align-super text-[11px] font-medium leading-4 text-text-secondary transition-colors hover:border-border-strong hover:bg-bg-hover hover:text-text-primary";

function ContextMessages({ messages }: { messages?: CitationContextMessage[] }) {
  if (!messages?.length) return null;
  return (
    <>
      {messages.map((msg, i) => (
        <div
          key={`${msg.sent_at}-${i}`}
          className="rounded-sm px-2 py-1.5 text-xs leading-snug text-text-tertiary italic"
        >
          <div className="mb-0.5 flex items-baseline justify-between gap-2">
            <span className="text-[12px] font-medium">{msg.sender}</span>
            <span className="shrink-0 text-[11px] text-text-tertiary">
              {formatCitationTime(msg.sent_at)}
            </span>
          </div>
          <div className="break-words">{msg.content}</div>
        </div>
      ))}
    </>
  );
}

function JumpToOriginal({ citation, onJump }: { citation: CitationItem; onJump: () => void }) {
  const tr = useT();
  if (!citation.channel_id || !citation.message_seq || citation.channel_type == null) return null;
  return (
    <div className="border-t border-border-subtle bg-bg-surface px-3 py-2 text-right">
      <button
        type="button"
        className="inline-flex h-7 items-center rounded-md px-2 text-[12px] font-medium text-text-primary transition-colors hover:bg-bg-hover"
        onClick={(e) => {
          e.stopPropagation();
          onJump();
          let channelId = citation.channel_id!;
          const ct = resolveChannelType(citation.channel_type);
          if (ct === ChannelTypePerson && channelId.includes("@")) {
            const loginUid = authStore.state.user?.uid;
            channelId = channelId.split("@").find((id) => id !== loginUid) || channelId;
          }
          const ch = new Channel(channelId, ct);
          chatLocateMessageActions.request(ch, citation.message_seq!, { strategy: "window" });
          chatSelectedActions.select(ch);
          void router.navigate({ href: "/" });
        }}
      >
        {tr("summary.citation.jumpToOriginal")}
      </button>
    </div>
  );
}

interface CitationGroupBadgeProps {
  indices: number[];
  citations: CitationItem[];
  badgeKey: string;
}

interface MergedMessage {
  sender: string;
  content: string;
  sent_at: string;
  message_seq?: number;
  cited: boolean;
  citation_index?: number;
}

function mergeGroupMessages(group: CitationItem[]): MergedMessage[] {
  const all: MergedMessage[] = [];
  for (const c of group) {
    for (const m of c.context_before ?? []) {
      all.push({
        sender: m.sender,
        content: m.content,
        sent_at: m.sent_at,
        message_seq: m.message_seq,
        cited: false,
      });
    }
    all.push({
      sender: c.sender,
      content: c.content,
      sent_at: c.sent_at,
      message_seq: c.message_seq,
      cited: true,
      citation_index: c.index,
    });
    for (const m of c.context_after ?? []) {
      all.push({
        sender: m.sender,
        content: m.content,
        sent_at: m.sent_at,
        message_seq: m.message_seq,
        cited: false,
      });
    }
  }
  const seen = new Map<string, MergedMessage>();
  for (const msg of all) {
    const key =
      msg.message_seq != null
        ? `seq:${msg.message_seq}`
        : `${msg.sender} ${msg.content} ${msg.sent_at}`;
    const existing = seen.get(key);
    if (!existing || (msg.cited && !existing.cited)) seen.set(key, msg);
  }
  const out = [...seen.values()];
  out.sort((a, b) => {
    if (a.message_seq != null && b.message_seq != null) return a.message_seq - b.message_seq;
    return new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime();
  });
  return out;
}

function CitationGroupBadge({ indices, citations, badgeKey }: CitationGroupBadgeProps) {
  const { activeKey, onBadgeClick, closeKey } = useContext(CitationCtx);
  const groupCitations = useMemo(
    () =>
      indices
        .map((i) => citations.find((c) => c.index === i))
        .filter((c): c is CitationItem => !!c),
    [indices, citations],
  );
  const messages = useMemo(() => mergeGroupMessages(groupCitations), [groupCitations]);
  const label =
    indices.length === 1 ? `${indices[0]}` : `${indices[0]}-${indices[indices.length - 1]}`;

  if (groupCitations.length === 0) return <sup className={badgeClass}>[{label}]</sup>;

  const visible = activeKey === badgeKey;
  const first = groupCitations[0];

  return (
    <Popover open={visible} onOpenChange={(open) => !open && closeKey(badgeKey)}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={badgeClass}
          onClick={(e) => {
            e.stopPropagation();
            onBadgeClick(badgeKey);
          }}
        >
          [{label}]
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        className="w-[380px] max-w-[calc(100vw-32px)] overflow-hidden p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="max-h-[360px] overflow-y-auto p-2">
          {messages.map((msg, i) => (
            <div
              key={msg.message_seq ?? `${msg.sent_at}-${i}`}
              className={
                msg.cited
                  ? "rounded-sm border-l-2 border-text-primary bg-bg-elevated px-2.5 py-2 text-[13px] leading-snug"
                  : "rounded-sm px-2.5 py-1.5 text-xs leading-snug text-text-tertiary italic"
              }
            >
              <div className="mb-0.5 flex items-baseline justify-between gap-3">
                <span
                  className={
                    msg.cited
                      ? "min-w-0 truncate text-[13px] font-semibold"
                      : "min-w-0 truncate text-[12px] font-medium"
                  }
                >
                  {msg.sender}
                </span>
                <span className="shrink-0 text-[11px] text-text-tertiary">
                  {formatCitationTime(msg.sent_at)}
                </span>
              </div>
              <div className="break-words">{msg.content}</div>
            </div>
          ))}
        </div>
        <JumpToOriginal citation={first} onJump={() => closeKey(badgeKey)} />
      </PopoverContent>
    </Popover>
  );
}

interface CitationSingleBadgeProps {
  index: number;
  citations: CitationItem[];
  badgeKey: string;
}

function CitationSingleBadge({ index, citations, badgeKey }: CitationSingleBadgeProps) {
  const { activeKey, onBadgeClick, closeKey } = useContext(CitationCtx);
  const citation = citations.find((c) => c.index === index);
  if (!citation) return <sup className={badgeClass}>[{index}]</sup>;
  const visible = activeKey === badgeKey;

  return (
    <Popover open={visible} onOpenChange={(open) => !open && closeKey(badgeKey)}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={badgeClass}
          onClick={(e) => {
            e.stopPropagation();
            onBadgeClick(badgeKey);
          }}
        >
          [{index}]
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        className="w-[380px] max-w-[calc(100vw-32px)] overflow-hidden p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="max-h-[360px] overflow-y-auto p-2">
          <ContextMessages messages={citation.context_before} />
          <div className="rounded-sm border-l-2 border-text-primary bg-bg-elevated px-2.5 py-2 text-[13px] leading-snug">
            <div className="mb-0.5 flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-[13px] font-semibold">{citation.sender}</span>
              <span className="shrink-0 text-[11px] text-text-tertiary">
                {formatCitationTime(citation.sent_at)}
              </span>
            </div>
            {citation.source ? (
              <div className="mb-1 text-[12px] text-text-tertiary">
                {t("summary.citation.sourceLine", { values: { source: citation.source } })}
              </div>
            ) : null}
            <div className="break-words">{citation.content}</div>
          </div>
          <ContextMessages messages={citation.context_after} />
        </div>
        <JumpToOriginal citation={citation} onJump={() => closeKey(badgeKey)} />
      </PopoverContent>
    </Popover>
  );
}

// ─── 主体 ─────────────────────────────────────────────────

const citationSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), "citation", "citationgroup"],
  attributes: {
    ...defaultSchema.attributes,
    citation: ["index", "badgekey"],
    citationgroup: ["indices", "badgekey"],
  },
};

const baseRemarkPlugins = [remarkGfm, remarkBreaks];
const rehypePlugins: PluggableList = [[rehypeSanitize, citationSchema]];

interface CitationNodeProps {
  index?: number | string;
  badgekey?: string;
  node?: { properties?: { index?: number | string; badgekey?: string } };
}

interface CitationGroupNodeProps {
  indices?: string;
  badgekey?: string;
  node?: { properties?: { indices?: string; badgekey?: string } };
}

/**
 * 总结正文(含引用 [1] [2] [3])。
 */
export function CitationText({ content, citations }: CitationTextProps) {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const onBadgeClick = useCallback(
    (key: string) => setActiveKey((prev) => (prev === key ? null : key)),
    [],
  );
  const closeKey = useCallback(
    (key: string) => setActiveKey((prev) => (prev === key ? null : prev)),
    [],
  );

  const ctxValue = useMemo(
    () => ({ activeKey, onBadgeClick, closeKey }),
    [activeKey, onBadgeClick, closeKey],
  );

  const components = useMemo(
    () => ({
      citation: ({ index, badgekey, node }: CitationNodeProps) => {
        const rawIndex = node?.properties?.index ?? index;
        const badgeKey = node?.properties?.badgekey ?? badgekey;
        if (rawIndex == null || !badgeKey) return null;
        const parsedIndex = Number(rawIndex);
        if (!Number.isFinite(parsedIndex)) return null;
        return (
          <CitationSingleBadge index={parsedIndex} citations={citations} badgeKey={badgeKey} />
        );
      },
      citationgroup: ({ indices, badgekey, node }: CitationGroupNodeProps) => {
        const indicesText = node?.properties?.indices ?? indices;
        const badgeKey = node?.properties?.badgekey ?? badgekey;
        if (!indicesText || !badgeKey) return null;
        const arr = indicesText.split(",").map((s) => parseInt(s, 10));
        return <CitationGroupBadge indices={arr} citations={citations} badgeKey={badgeKey} />;
      },
    }),
    [citations],
  );

  return (
    <CitationCtx.Provider value={ctxValue}>
      <div className={summaryMarkdownClass} onClick={() => setActiveKey(null)}>
        <ReactMarkdown
          remarkPlugins={[...baseRemarkPlugins, [remarkCitation, citations]]}
          rehypePlugins={rehypePlugins}
          components={components as Record<string, unknown>}
        >
          {content}
        </ReactMarkdown>
      </div>
    </CitationCtx.Provider>
  );
}
