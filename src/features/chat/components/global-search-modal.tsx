import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Channel, ChannelTypeGroup, ChannelTypePerson } from "wukongimjssdk";
import { Search } from "lucide-react";
import { Virtuoso } from "react-virtuoso";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { chatSelectedActions } from "@/features/chat/stores/chat-selected";
import { AiBadge } from "@/features/base/components/badges/ai-badge";
import { sanitizeHighlight } from "@/features/base/lib/sanitize-highlight";
import {
  searchGlobal,
  type SearchFriend,
  type SearchGroup,
  type SearchMessage,
} from "@/features/base/api/endpoints/search.api";
import { BaseDialog } from "@/features/base/components/overlay/base-dialog";

interface GlobalSearchModalProps {
  open: boolean;
  /** Channel 内搜索:传 channel,只显示"全部 / 文件"两 tab */
  channel?: Channel;
  onClose: () => void;
}

type SearchTab = "contacts" | "groups" | "files";

const FILE_CONTENT_TYPE = 4; // MessageContentType.file

/**
 * input → keyword 300ms debounce(命名 hook,符合 no-useeffect-in-component)。
 */
function useDebouncedKeyword(input: string, composing: boolean, setKeyword: (k: string) => void) {
  useEffect(() => {
    if (composing) return;
    const t = setTimeout(() => setKeyword(input), 300);
    return () => clearTimeout(t);
  }, [input, composing, setKeyword]);
}

/** open 翻转时 reset 内部 state(命名 hook 包 useEffect)。 */
function useResetOnOpen(
  open: boolean,
  inChannel: boolean,
  setInput: (v: string) => void,
  setKeyword: (v: string) => void,
  setTab: (t: SearchTab) => void,
) {
  useEffect(() => {
    if (open) {
      setInput("");
      setKeyword("");
      setTab(inChannel ? "files" : "contacts");
    }
  }, [open, inChannel, setInput, setKeyword, setTab]);
}

/**
 * 全局搜索弹窗(对应旧 dmworkbase Components/GlobalSearch)。
 *
 * 浮动元素壳层统一规范 Phase C4 — 走 BaseDialog,size=lg(max-w-2xl),
 * className 覆盖把卡片改为顶部对齐(Cmd+K 风格,top 10vh)而非默认中央。
 */
export function GlobalSearchModal({ open, channel, onClose }: GlobalSearchModalProps) {
  const [input, setInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [tab, setTab] = useState<SearchTab>("contacts");
  const [composing, setComposing] = useState(false);

  const inChannel = !!channel;

  useDebouncedKeyword(input, composing, setKeyword);
  useResetOnOpen(open, inChannel, setInput, setKeyword, setTab);

  const contentType = tab === "files" ? [FILE_CONTENT_TYPE] : ([] as number[]);

  const { data, isFetching } = useQuery({
    queryKey: ["search", "global", keyword, contentType, channel?.channelID, channel?.channelType],
    queryFn: () =>
      searchGlobal({
        keyword,
        contentType,
        channelId: channel?.channelID,
        channelType: channel?.channelType,
        onlyMessage: inChannel,
      }),
    enabled: open,
    staleTime: 30 * 1000,
  });

  const tabs: { id: SearchTab; label: string }[] = inChannel
    ? [
        { id: "contacts", label: "全部" },
        { id: "files", label: "文件" },
      ]
    : [
        { id: "contacts", label: "联系人" },
        { id: "groups", label: "群组" },
        { id: "files", label: "文件" },
      ];

  return (
    <BaseDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      size="lg"
      height="sm"
      title={inChannel ? "聊天内搜索" : "全局搜索"}
      // 覆盖默认中央定位 → 顶部对齐 10vh(Cmd+K 风格);dialog.tsx 默认 top-1/2 -translate-y-1/2
      className="top-[10vh] -translate-y-0"
      contentClassName="overflow-hidden"
    >
      <div className="shrink-0 border-b border-border-subtle px-5 py-3">
        <div className="flex items-center gap-2 rounded-md border border-border-default bg-bg-base px-3 py-2 focus-within:border-brand">
          <Search size={14} className="text-text-tertiary" />
          <input
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onCompositionStart={() => setComposing(true)}
            onCompositionEnd={(e) => {
              setComposing(false);
              setInput((e.target as HTMLInputElement).value);
            }}
            placeholder="搜索联系人 / 群 / 消息"
            className="flex-1 border-0 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none"
          />
          {input ? (
            <button
              type="button"
              onClick={() => setInput("")}
              aria-label="清空"
              className="text-text-tertiary hover:text-text-primary"
            >
              ×
            </button>
          ) : null}
        </div>
      </div>

      <nav className="flex shrink-0 items-center gap-1 border-b border-border-subtle px-3 py-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === t.id
                ? "bg-brand-tint text-text-primary"
                : "text-text-secondary hover:bg-bg-hover"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="flex min-h-0 flex-1 flex-col">
        {isFetching && !data ? (
          <div className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
            {keyword.trim().length === 0 ? "加载默认列表…" : "搜索中…"}
          </div>
        ) : (
          <SearchResultBody tab={tab} data={data} onClose={onClose} inChannel={inChannel} />
        )}
      </div>
    </BaseDialog>
  );
}

function SearchResultBody({
  tab,
  data,
  onClose,
  inChannel,
}: {
  tab: SearchTab;
  data:
    | { friends?: SearchFriend[]; groups?: SearchGroup[]; messages?: SearchMessage[] }
    | undefined;
  onClose: () => void;
  inChannel: boolean;
}) {
  const friends = data?.friends ?? [];
  const groups = data?.groups ?? [];
  const messages = data?.messages ?? [];

  if (tab === "contacts") {
    if (inChannel) {
      return <MessagesList items={messages} onClose={onClose} />;
    }
    return <FriendsList items={friends} onClose={onClose} />;
  }
  if (tab === "groups") {
    return <GroupsList items={groups} onClose={onClose} />;
  }
  return <MessagesList items={messages} onClose={onClose} />;
}

function FriendsList({ items, onClose }: { items: SearchFriend[]; onClose: () => void }) {
  if (items.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
        没有找到联系人
      </div>
    );
  }
  return (
    <Virtuoso
      data={items}
      style={{ height: "100%" }}
      increaseViewportBy={200}
      itemContent={(_idx: number, f: SearchFriend) => {
        const channel = new Channel(f.channel_id, ChannelTypePerson);
        const name = f.channel_remark || f.channel_name;
        return (
          <button
            type="button"
            onClick={() => {
              chatSelectedActions.select(channel);
              onClose();
            }}
            className="flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors hover:bg-bg-hover"
          >
            <ChannelAvatar channel={channel} size={36} title={name.replace(/<\/?mark>/gi, "")} />
            <span className="flex min-w-0 flex-1 items-center gap-1.5">
              <span
                className="truncate text-sm text-text-primary"
                dangerouslySetInnerHTML={{ __html: sanitizeHighlight(name) }}
              />
              {f.robot === 1 ? <AiBadge size="small" /> : null}
              {f.source_space_name ? (
                <span className="shrink-0 text-[11px] text-text-tertiary">
                  @{f.source_space_name}
                </span>
              ) : null}
            </span>
          </button>
        );
      }}
    />
  );
}

function GroupsList({ items, onClose }: { items: SearchGroup[]; onClose: () => void }) {
  if (items.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
        没有找到群组
      </div>
    );
  }
  return (
    <Virtuoso
      data={items}
      style={{ height: "100%" }}
      increaseViewportBy={200}
      itemContent={(_idx: number, g: SearchGroup) => {
        const channel = new Channel(g.channel_id, ChannelTypeGroup);
        const name = g.channel_remark || g.channel_name;
        return (
          <button
            type="button"
            onClick={() => {
              chatSelectedActions.select(channel);
              onClose();
            }}
            className="flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors hover:bg-bg-hover"
          >
            <ChannelAvatar channel={channel} size={36} title={name.replace(/<\/?mark>/gi, "")} />
            <span className="flex min-w-0 flex-1 items-center gap-1.5">
              <span
                className="truncate text-sm text-text-primary"
                dangerouslySetInnerHTML={{ __html: sanitizeHighlight(name) }}
              />
              <span className="shrink-0 rounded-sm bg-bg-elevated px-1.5 text-[10px] text-text-tertiary">
                群
              </span>
            </span>
            {typeof g.member_count === "number" ? (
              <span className="shrink-0 text-[11px] text-text-tertiary">{g.member_count}</span>
            ) : null}
          </button>
        );
      }}
    />
  );
}

interface MessageRow {
  kind: "header" | "message" | "more";
  key: string;
  channel: Channel;
  channelName: string;
  message?: SearchMessage;
  moreCount?: number;
}

function MessagesList({ items, onClose }: { items: SearchMessage[]; onClose: () => void }) {
  const rows: MessageRow[] = useMemo(() => {
    const map = new Map<string, SearchMessage[]>();
    for (const m of items) {
      const key = `${m.channel.channel_type}-${m.channel.channel_id}`;
      const list = map.get(key) ?? [];
      list.push(m);
      map.set(key, list);
    }
    const out: MessageRow[] = [];
    for (const [key, msgs] of map.entries()) {
      const first = msgs[0];
      const ch = new Channel(first.channel.channel_id, first.channel.channel_type);
      const chName = first.channel.channel_remark || first.channel.channel_name;
      out.push({ kind: "header", key: `h-${key}`, channel: ch, channelName: chName });
      msgs.slice(0, 3).forEach((m, idx) => {
        out.push({
          kind: "message",
          key: `m-${key}-${m.message_id ?? idx}`,
          channel: ch,
          channelName: chName,
          message: m,
        });
      });
      if (msgs.length > 3) {
        out.push({
          kind: "more",
          key: `more-${key}`,
          channel: ch,
          channelName: chName,
          moreCount: msgs.length - 3,
        });
      }
    }
    return out;
  }, [items]);

  if (items.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
        没有找到消息
      </div>
    );
  }

  return (
    <Virtuoso
      data={rows}
      style={{ height: "100%" }}
      increaseViewportBy={200}
      itemContent={(_idx: number, row: MessageRow) => {
        if (row.kind === "header") {
          return (
            <div className="px-5 py-1 text-[11px] font-semibold text-text-tertiary">
              {row.channelName}
            </div>
          );
        }
        if (row.kind === "more") {
          return (
            <div className="px-5 py-1 text-[11px] text-text-tertiary">
              还有 {row.moreCount} 条匹配...
            </div>
          );
        }
        const m = row.message!;
        return (
          <button
            type="button"
            onClick={() => {
              chatSelectedActions.select(row.channel);
              onClose();
            }}
            className="flex w-full items-start gap-3 px-5 py-2 text-left transition-colors hover:bg-bg-hover"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-bg-elevated text-xs text-text-secondary">
              {(m.from_name ?? m.from_uid ?? "?").slice(0, 1).toUpperCase()}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex items-baseline gap-2 text-[11px]">
                <span className="truncate font-semibold text-text-primary">
                  {m.from_name ?? m.from_uid}
                </span>
                {m.timestamp ? (
                  <span className="text-text-tertiary">{formatTimestamp(m.timestamp)}</span>
                ) : null}
              </div>
              <span
                className="truncate text-xs text-text-secondary"
                dangerouslySetInnerHTML={{
                  __html: sanitizeHighlight(m.conversationDigest ?? digestFromPayload(m)),
                }}
              />
            </div>
          </button>
        );
      }}
    />
  );
}

function digestFromPayload(m: SearchMessage): string {
  if (!m.payload) return "[消息]";
  const content = m.payload as { content?: string };
  return content.content ?? "[消息]";
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts * 1000);
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  if (sameYear) {
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}
