import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Channel, ChannelTypeGroup, ChannelTypePerson } from "wukongimjssdk";
import { Search, X } from "lucide-react";
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
 * 中文 composition 期间不同步 keyword(避免拼音串触发搜索),等 compositionEnd 后
 * 下一次 input 变化触发(此时 input 已是最终汉字)。
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
 * 全局搜索弹窗(对应旧 dmworkbase Components/GlobalSearch):
 *
 * - 顶部:输入框 + close
 * - 3 tab:联系人 / 群组 / 文件;channel 内搜索 collapse 为"全部 / 文件"
 * - 联系人 / 群组 tab:展示 friends / groups,点击跳到对应 chat
 * - 文件 tab:content_type=file 过滤,展示 messages,点击跳到 channel
 *
 * 输入 debounce 300ms;**composing 期间 input 受控状态正常更新(显示拼音),
 * 但 keyword 不同步**,避免拼音串触发服务端搜索。
 *
 * 点击 row:chatSelectedActions.select + onClose(简版,不做消息精确定位)。
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
    enabled: open && keyword.trim().length > 0,
    staleTime: 30 * 1000,
  });

  if (!open) return null;

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
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[10vh]">
      <div className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-border-default bg-bg-surface shadow-xl">
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border-subtle px-5 py-3">
          <h2 className="text-sm font-semibold text-text-primary">
            {inChannel ? "聊天内搜索" : "全局搜索"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
          >
            <X size={16} />
          </button>
        </header>

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

        <div className="flex flex-1 flex-col overflow-y-auto">
          {keyword.trim().length === 0 ? (
            <div className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
              输入关键字开始搜索
            </div>
          ) : isFetching && !data ? (
            <div className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
              搜索中…
            </div>
          ) : (
            <SearchResultBody tab={tab} data={data} onClose={onClose} inChannel={inChannel} />
          )}
        </div>
      </div>
    </div>
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
    <ul className="flex flex-col">
      {items.map((f) => {
        const channel = new Channel(f.channel_id, ChannelTypePerson);
        const name = f.channel_remark || f.channel_name;
        return (
          <li key={f.channel_id}>
            <button
              type="button"
              onClick={() => {
                chatSelectedActions.select(channel);
                onClose();
              }}
              className="flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors hover:bg-bg-hover"
            >
              <ChannelAvatar channel={channel} size={36} title={name} />
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
          </li>
        );
      })}
    </ul>
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
    <ul className="flex flex-col">
      {items.map((g) => {
        const channel = new Channel(g.channel_id, ChannelTypeGroup);
        const name = g.channel_remark || g.channel_name;
        return (
          <li key={g.channel_id}>
            <button
              type="button"
              onClick={() => {
                chatSelectedActions.select(channel);
                onClose();
              }}
              className="flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors hover:bg-bg-hover"
            >
              <ChannelAvatar channel={channel} size={36} title={name} />
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
          </li>
        );
      })}
    </ul>
  );
}

function MessagesList({ items, onClose }: { items: SearchMessage[]; onClose: () => void }) {
  const groupedByChannel = useMemo(() => {
    const map = new Map<string, SearchMessage[]>();
    for (const m of items) {
      const key = `${m.channel.channel_type}-${m.channel.channel_id}`;
      const list = map.get(key) ?? [];
      list.push(m);
      map.set(key, list);
    }
    return map;
  }, [items]);

  if (items.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
        没有找到消息
      </div>
    );
  }

  const blocks = [...groupedByChannel.entries()];
  return (
    <ul className="flex flex-col gap-1 py-2">
      {blocks.map(([key, msgs]) => {
        const first = msgs[0];
        const channel = new Channel(first.channel.channel_id, first.channel.channel_type);
        const channelName = first.channel.channel_remark || first.channel.channel_name;
        return (
          <li key={key} className="flex flex-col">
            <header className="px-5 py-1 text-[11px] font-semibold text-text-tertiary">
              {channelName}
            </header>
            {msgs.slice(0, 3).map((m, idx) => (
              <button
                key={`${m.message_id ?? idx}`}
                type="button"
                onClick={() => {
                  chatSelectedActions.select(channel);
                  onClose();
                }}
                className="flex w-full items-start gap-3 px-5 py-2 text-left transition-colors hover:bg-bg-hover"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-bg-elevated text-xs text-text-secondary">
                  {(m.from_name ?? m.from_uid ?? "?").slice(0, 1).toUpperCase()}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <header className="flex items-baseline gap-2 text-[11px]">
                    <span className="truncate font-semibold text-text-primary">
                      {m.from_name ?? m.from_uid}
                    </span>
                    {m.timestamp ? (
                      <span className="text-text-tertiary">{formatTimestamp(m.timestamp)}</span>
                    ) : null}
                  </header>
                  <span
                    className="truncate text-xs text-text-secondary"
                    dangerouslySetInnerHTML={{
                      __html: sanitizeHighlight(m.conversationDigest ?? digestFromPayload(m)),
                    }}
                  />
                </div>
              </button>
            ))}
            {msgs.length > 3 ? (
              <span className="px-5 py-1 text-[11px] text-text-tertiary">
                还有 {msgs.length - 3} 条匹配...
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
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
