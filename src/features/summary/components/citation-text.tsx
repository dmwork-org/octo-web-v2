import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { visit } from "unist-util-visit";
import type { Plugin } from "unified";
import type { Node, Parent } from "unist";
import type { Root, Text } from "mdast";
import { Channel, ChannelTypeGroup, ChannelTypePerson } from "wukongimjssdk";
import { chatSelectedActions } from "@/features/chat/stores/chat-selected";
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

interface CitationGroupNode extends Node {
  type: "citationGroup";
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

      const parts: (Text | CitationGroupNode)[] = [];
      let cursor = 0;
      for (const g of groups) {
        if (g.start > cursor) {
          parts.push({ type: "text", value: node.value.slice(cursor, g.start) });
        }
        occurrence += 1;
        parts.push({
          type: "citationGroup",
          data: {
            hName: "citationgroup",
            hProperties: {
              indices: g.indices.join(","),
              badgekey: `${occurrence}-${g.indices.join(",")}`,
            },
          },
        });
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
  "ml-0.5 inline-flex cursor-pointer items-center rounded-sm bg-brand-tint px-1 align-super text-[11px] leading-4 text-brand hover:bg-brand-tint/80";

function ContextMessages({ messages }: { messages?: CitationContextMessage[] }) {
  if (!messages?.length) return null;
  return (
    <>
      {messages.map((msg, i) => (
        <div
          key={`${msg.sent_at}-${i}`}
          className="px-2 py-1 text-xs leading-snug text-text-tertiary italic"
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
  if (!citation.channel_id || !citation.message_seq || citation.channel_type == null) return null;
  return (
    <div className="mt-2 border-t border-border-subtle pt-1.5 text-right">
      <button
        type="button"
        className="text-[12px] text-brand hover:underline"
        onClick={(e) => {
          e.stopPropagation();
          onJump();
          const ct = resolveChannelType(citation.channel_type);
          const ch = new Channel(citation.channel_id!, ct);
          chatSelectedActions.select(ch);
        }}
      >
        跳转到原文 →
      </button>
    </div>
  );
}

const popoverStyle: CSSProperties = {
  position: "absolute",
  bottom: "calc(100% + 6px)",
  left: 0,
  zIndex: 50,
  width: 340,
  maxHeight: 360,
};

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
    <span className="relative inline">
      <sup
        role="button"
        tabIndex={0}
        className={badgeClass}
        onClick={(e) => {
          e.stopPropagation();
          onBadgeClick(badgeKey);
        }}
      >
        [{label}]
      </sup>
      {visible ? (
        <span
          style={popoverStyle}
          className="overflow-y-auto rounded-md border border-border-default bg-bg-surface p-2 text-text-primary shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          {messages.map((msg, i) => (
            <div
              key={msg.message_seq ?? `${msg.sent_at}-${i}`}
              className={
                msg.cited
                  ? "border-l-2 border-brand px-2 py-1 text-[13px] leading-snug"
                  : "px-2 py-1 text-xs leading-snug text-text-tertiary italic"
              }
            >
              <div className="mb-0.5 flex items-baseline justify-between gap-2">
                <span
                  className={msg.cited ? "text-[13px] font-semibold" : "text-[12px] font-medium"}
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
          <JumpToOriginal citation={first} onJump={() => closeKey(badgeKey)} />
        </span>
      ) : null}
    </span>
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
    <span className="relative inline">
      <sup
        role="button"
        tabIndex={0}
        className={badgeClass}
        onClick={(e) => {
          e.stopPropagation();
          onBadgeClick(badgeKey);
        }}
      >
        [{index}]
      </sup>
      {visible ? (
        <span
          style={popoverStyle}
          className="overflow-y-auto rounded-md border border-border-default bg-bg-surface p-2 text-text-primary shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <ContextMessages messages={citation.context_before} />
          <div className="border-l-2 border-brand px-2 py-1 text-[13px] leading-snug">
            <div className="mb-0.5 flex items-baseline justify-between gap-2">
              <span className="text-[13px] font-semibold">{citation.sender}</span>
              <span className="shrink-0 text-[11px] text-text-tertiary">
                {formatCitationTime(citation.sent_at)}
              </span>
            </div>
            {citation.source ? (
              <div className="mb-1 text-[12px] text-text-tertiary">来源:{citation.source}</div>
            ) : null}
            <div className="break-words">{citation.content}</div>
          </div>
          <ContextMessages messages={citation.context_after} />
          <JumpToOriginal citation={citation} onJump={() => closeKey(badgeKey)} />
        </span>
      ) : null}
    </span>
  );
}

// ─── 主体 ─────────────────────────────────────────────────

const proseClass =
  "text-sm leading-relaxed text-text-primary [&_a]:text-brand [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-border-default [&_blockquote]:pl-3 [&_blockquote]:text-text-secondary [&_code]:rounded [&_code]:bg-bg-elevated [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[12px] [&_h1]:mb-2 [&_h1]:mt-4 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:mt-3 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mb-1 [&_h3]:mt-3 [&_h3]:text-sm [&_h3]:font-semibold [&_hr]:my-3 [&_hr]:border-border-subtle [&_li]:my-0.5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-bg-elevated [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_table]:my-3 [&_table]:border-collapse [&_table]:border [&_table]:border-border-default [&_td]:border [&_td]:border-border-default [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-border-default [&_th]:bg-bg-elevated [&_th]:px-2 [&_th]:py-1 [&_th]:font-semibold [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5";

interface CitationGroupNodeProps {
  indices?: string;
  badgekey?: string;
}

/**
 * 总结正文(含引用 [1] [2] [3]):
 *
 * - remark 插件扫文本节点,把连续相同 channel_id 的 [N][M] 合并为 group badge
 *   `[1-3]`(`indices` 属性传 `1,2,3`),孤立 `[N]` 渲染单 badge
 * - badge click 显示 popover:被引消息 + 上下文 + 跳转原文(调用
 *   `chatSelectedActions.select`)
 * - activeKey 单 popover 互斥;空白点击关闭
 *
 * 旧 dmworksummary CitationText 用 Semi Popover + rehype-sanitize,这里用 absolute
 * span 自管(无新依赖),click outside 由父 div onClick 关掉。
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
      citationgroup: ({ indices, badgekey }: CitationGroupNodeProps) => {
        if (!indices || !badgekey) return null;
        const arr = indices.split(",").map((s) => parseInt(s, 10));
        if (arr.length === 1) {
          return <CitationSingleBadge index={arr[0]} citations={citations} badgeKey={badgekey} />;
        }
        return <CitationGroupBadge indices={arr} citations={citations} badgeKey={badgekey} />;
      },
    }),
    [citations],
  );

  return (
    <CitationCtx.Provider value={ctxValue}>
      <div className={proseClass} onClick={() => setActiveKey(null)}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm, [remarkCitation, citations]]}
          components={components as Record<string, unknown>}
        >
          {content}
        </ReactMarkdown>
      </div>
    </CitationCtx.Provider>
  );
}
