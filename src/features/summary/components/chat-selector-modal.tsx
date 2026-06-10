import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import WKSDK, {
  Channel,
  ChannelTypeGroup,
  ChannelTypePerson,
  type ChannelInfo,
} from "wukongimjssdk";
import { Check, Search } from "lucide-react";
import { BaseDialog } from "@/features/base/components/overlay/base-dialog";
import { Button } from "@/components/semi-bridge/button";
import { useT } from "@/lib/i18n/use-t";
import { t } from "@/lib/i18n/instance";
import { ThreadIcon } from "@/components/ui/thread-icon";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { useChannelInfoTick } from "@/features/chat/hooks/use-channel-info-tick.hook";
import { parseThreadChannelId } from "@/features/base/im/parse-thread-channel-id";
import { getChatCandidates } from "@/features/summary/api/summary.api";
import { MAX_CHAT_SELECT } from "@/features/summary/constants/topic-templates";
import type { ChatCandidate } from "@/features/summary/types/summary.types";

type Tab = "all" | "group" | "direct";

const TAB_KEY: Record<Tab, string> = {
  all: "summary.chatSelector.all",
  group: "summary.chatSelector.tabGroup",
  direct: "summary.chatSelector.tabDirect",
};

const CHANNEL_TYPE_THREAD = 5;
const CHAT_ROW_HEIGHT = 36;
const CHAT_LIST_OVERSCAN = 8;
const CHANNEL_INFO_REQUEST_TTL_MS = 3000;

interface ChatSelectorModalProps {
  open: boolean;
  selected: ChatCandidate[];
  /** 默认 MAX_CHAT_SELECT(30),老仓同。 */
  maxSelect?: number;
  onConfirm: (selected: ChatCandidate[]) => void;
  onCancel: () => void;
}

interface DisplayEntry {
  item: ChatCandidate;
  indent: boolean;
}

type ChatChannelOrg = {
  displayName?: string;
  member_count?: number;
  parentGroupNo?: string;
};

function chatTypeToChannelType(chatType: ChatCandidate["chat_type"]): number {
  if (chatType === "direct") return ChannelTypePerson;
  if (chatType === "thread") return CHANNEL_TYPE_THREAD;
  return ChannelTypeGroup;
}

function channelOfCandidate(item: ChatCandidate): Channel {
  return new Channel(item.chat_id, chatTypeToChannelType(item.chat_type));
}

function channelInfoOf(item: ChatCandidate): ChannelInfo | undefined {
  return WKSDK.shared().channelManager.getChannelInfo(channelOfCandidate(item));
}

function orgDataOf(item: ChatCandidate): ChatChannelOrg {
  return (channelInfoOf(item)?.orgData as ChatChannelOrg | undefined) ?? {};
}

function parentGroupNoOf(item: ChatCandidate): string | undefined {
  if (item.chat_type !== "thread") return undefined;
  return (
    item.parent_group_no ??
    orgDataOf(item).parentGroupNo ??
    parseThreadChannelId(item.chat_id)?.groupNo
  );
}

function rawChannelName(item: ChatCandidate): string {
  const info = channelInfoOf(item);
  const org = orgDataOf(item);
  return org.displayName || info?.title || item.name || "";
}

function isPlaceholderName(item: ChatCandidate, name: string): boolean {
  if (!name || name === item.chat_id) return true;
  return item.chat_type === "thread" && name === t("chatHeader.thread");
}

function displayNameOf(item: ChatCandidate): string {
  const name = rawChannelName(item);
  if (isPlaceholderName(item, name)) return "";
  return name;
}

function memberCountOf(item: ChatCandidate): number | null {
  const count = orgDataOf(item).member_count;
  return typeof count === "number" ? count : item.member_count;
}

function enrichCandidate(item: ChatCandidate): ChatCandidate {
  const resolvedName = displayNameOf(item);
  return {
    ...item,
    name: resolvedName || item.name,
    member_count: memberCountOf(item),
    parent_group_no: parentGroupNoOf(item),
  };
}

function needsChannelInfoRefresh(item: ChatCandidate): boolean {
  const info = channelInfoOf(item);
  if (!info) return true;
  const name = rawChannelName(item);
  const nameMissing = isPlaceholderName(item, name);
  const logoMissing = item.chat_type === "group" && !info.logo;
  return nameMissing || logoMissing;
}

function requestChannelInfoOnce(item: ChatCandidate, requested: Map<string, number>): void {
  const channel = channelOfCandidate(item);
  const key = `${channel.channelType}-${channel.channelID}`;
  const now = Date.now();
  const lastRequestedAt = requested.get(key) ?? 0;
  if (now - lastRequestedAt < CHANNEL_INFO_REQUEST_TTL_MS || !needsChannelInfoRefresh(item)) {
    return;
  }
  requested.set(key, now);
  void WKSDK.shared().channelManager.fetchChannelInfo(channel);
}

function requestParentGroupInfoOnce(parentGroupNo: string, requested: Map<string, number>): void {
  const channel = new Channel(parentGroupNo, ChannelTypeGroup);
  const key = `${channel.channelType}-${channel.channelID}`;
  const now = Date.now();
  const lastRequestedAt = requested.get(key) ?? 0;
  const info = WKSDK.shared().channelManager.getChannelInfo(channel);
  const org = (info?.orgData as ChatChannelOrg | undefined) ?? {};
  const hasName = !!(org.displayName || info?.title);
  if (now - lastRequestedAt < CHANNEL_INFO_REQUEST_TTL_MS || (hasName && info?.logo)) return;
  requested.set(key, now);
  void WKSDK.shared().channelManager.fetchChannelInfo(channel);
}

function useFetchVisibleChatCandidateInfo(
  item: ChatCandidate,
  requestedInfoRef: RefObject<Map<string, number>>,
) {
  useEffect(() => {
    const requested = requestedInfoRef.current;
    requestChannelInfoOnce(item, requested);
    const parentGroupNo = parentGroupNoOf(item);
    if (parentGroupNo) requestParentGroupInfoOnce(parentGroupNo, requested);
  }, [item, requestedInfoRef]);
}

function useResetScrollOnScopeChange(
  scrollRef: RefObject<HTMLDivElement | null>,
  scopeKey: string,
) {
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [scrollRef, scopeKey]);
}

/**
 * 把 candidates 按 (tab, keyword) 过滤 + group → thread 层次展示。
 * - "all":group + 缩进 thread + direct;有关键词时全 flatten 按 name 过滤
 * - "group":只 group + 缩进 thread + 孤儿 thread
 * - "direct":只 direct
 */
function buildDisplayList(candidates: ChatCandidate[], tab: Tab, keyword: string): DisplayEntry[] {
  const kw = keyword.trim().toLowerCase();
  const matches = (candidate: ChatCandidate) => {
    if (!kw) return true;
    const name = displayNameOf(candidate) || candidate.name;
    if (!name || isPlaceholderName(candidate, name)) return false;
    return name.toLowerCase().includes(kw);
  };

  if (tab === "direct") {
    return candidates
      .filter((c) => c.chat_type === "direct")
      .filter(matches)
      .map((c) => ({ item: c, indent: false }));
  }

  const groups = candidates.filter((c) => c.chat_type === "group");
  const threads = candidates.filter((c) => c.chat_type === "thread");
  const directs = tab === "all" ? candidates.filter((c) => c.chat_type === "direct") : [];

  const groupIds = new Set(groups.map((g) => g.chat_id));
  const threadsByParent = new Map<string, ChatCandidate[]>();
  const orphanThreads: ChatCandidate[] = [];
  for (const th of threads) {
    if (th.parent_group_no && groupIds.has(th.parent_group_no)) {
      const arr = threadsByParent.get(th.parent_group_no) ?? [];
      arr.push(th);
      threadsByParent.set(th.parent_group_no, arr);
    } else {
      orphanThreads.push(th);
    }
  }

  // 有 keyword 时 flatten 全展开过滤;无 keyword 时按层次展示
  if (kw) {
    const out: DisplayEntry[] = [];
    for (const g of groups) {
      if (matches(g)) out.push({ item: g, indent: false });
      for (const th of threadsByParent.get(g.chat_id) ?? []) {
        if (matches(th)) out.push({ item: th, indent: true });
      }
    }
    for (const th of orphanThreads) {
      if (matches(th)) out.push({ item: th, indent: false });
    }
    for (const d of directs) {
      if (matches(d)) out.push({ item: d, indent: false });
    }
    return out;
  }

  const out: DisplayEntry[] = [];
  for (const g of groups) {
    out.push({ item: g, indent: false });
    for (const th of threadsByParent.get(g.chat_id) ?? []) {
      out.push({ item: th, indent: true });
    }
  }
  for (const th of orphanThreads) out.push({ item: th, indent: false });
  for (const d of directs) out.push({ item: d, indent: false });
  return out;
}

function ChatCandidateAvatar({ item }: { item: ChatCandidate }) {
  const parentGroupNo = parentGroupNoOf(item);
  const avatarChannel =
    item.chat_type === "thread" && parentGroupNo
      ? new Channel(parentGroupNo, ChannelTypeGroup)
      : channelOfCandidate(item);
  const avatarInfo = WKSDK.shared().channelManager.getChannelInfo(avatarChannel);
  const avatarOrg = (avatarInfo?.orgData as ChatChannelOrg | undefined) ?? {};
  const avatarTitle = avatarOrg.displayName || avatarInfo?.title || displayNameOf(item);

  return (
    <div className="relative h-7 w-7 shrink-0">
      <ChannelAvatar channel={avatarChannel} size={28} title={avatarTitle} />
      {item.chat_type === "thread" ? (
        <span className="absolute right-[-2px] bottom-[-2px] flex h-3.5 w-3.5 items-center justify-center rounded-full border border-bg-surface bg-bg-elevated text-text-tertiary">
          <ThreadIcon size={8} />
        </span>
      ) : null}
    </div>
  );
}

function ChatCandidateName({ item }: { item: ChatCandidate }) {
  const tr = useT();
  const name = displayNameOf(item);
  if (name) {
    return <span className="min-w-0 flex-1 truncate text-sm text-text-primary">{name}</span>;
  }
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2 truncate text-sm text-text-tertiary">
      <span className="h-3 w-24 animate-pulse rounded-sm bg-bg-elevated" />
      <span className="sr-only">{tr("summary.common.loading")}</span>
    </span>
  );
}

interface ChatCandidateRowProps {
  item: ChatCandidate;
  indent: boolean;
  checked: boolean;
  onToggle: (item: ChatCandidate) => void;
  requestedInfoRef: RefObject<Map<string, number>>;
}

function ChatCandidateRow({
  item,
  indent,
  checked,
  onToggle,
  requestedInfoRef,
}: ChatCandidateRowProps) {
  useFetchVisibleChatCandidateInfo(item, requestedInfoRef);
  const memberCount = memberCountOf(item);

  return (
    <button
      type="button"
      onClick={() => onToggle(item)}
      className={`flex h-9 w-full cursor-pointer items-center gap-2 rounded-sm px-2 text-left transition-colors hover:bg-[rgba(28,28,35,0.03)] ${
        checked ? "bg-[rgba(28,28,35,0.05)]" : ""
      } ${indent ? "pl-7" : ""}`}
    >
      <span
        className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[3px] border-[1.5px] transition-colors ${
          checked ? "border-brand bg-brand text-text-inverse" : "border-border-strong bg-bg-surface"
        }`}
      >
        {checked ? <Check size={12} strokeWidth={2.5} /> : null}
      </span>
      <ChatCandidateAvatar item={item} />
      <ChatCandidateName item={item} />
      {memberCount != null ? (
        <span className="shrink-0 text-[10px] text-text-tertiary">{memberCount}</span>
      ) : null}
    </button>
  );
}

interface ChatCandidateListProps {
  items: DisplayEntry[];
  selectedIds: Set<string>;
  onToggle: (item: ChatCandidate) => void;
  requestedInfoRef: RefObject<Map<string, number>>;
  resetKey: string;
  empty: ReactNode;
}

function ChatCandidateList({
  items,
  selectedIds,
  onToggle,
  requestedInfoRef,
  resetKey,
  empty,
}: ChatCandidateListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  useResetScrollOnScopeChange(parentRef, resetKey);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => CHAT_ROW_HEIGHT,
    overscan: CHAT_LIST_OVERSCAN,
  });

  if (items.length === 0) {
    return <div className="flex-1 overflow-y-auto py-1">{empty}</div>;
  }

  return (
    <div ref={parentRef} className="min-h-0 flex-1 overflow-y-auto py-1">
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const entry = items[virtualItem.index];
          return (
            <div
              key={virtualItem.key}
              className="absolute top-0 left-0 w-full"
              style={{
                height: virtualItem.size,
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <ChatCandidateRow
                item={entry.item}
                indent={entry.indent}
                checked={selectedIds.has(entry.item.chat_id)}
                onToggle={onToggle}
                requestedInfoRef={requestedInfoRef}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * 选择聊天作为总结来源(chat-summary-new-modal 内的二级 modal)。
 *
 * - 后端 `/summary-chat-candidates` 返回当前 space 内所有授权 chat(全量,
 *   跟最近会话列表不同),按 group → thread → direct 层次展示。
 * - "全部 / 群聊 / 私聊" 三 tab 切换 + 名字模糊搜索。
 * - 多选,达到 maxSelect 后再点不增加(对齐老仓静默策略,不弹 toast)。
 * - 嵌套在 chat-summary-new-modal 内,BaseDialog 自动给 z-dialog-secondary。
 */
export function ChatSelectorModal({
  open,
  selected,
  maxSelect = MAX_CHAT_SELECT,
  onConfirm,
  onCancel,
}: ChatSelectorModalProps) {
  const tr = useT();
  const [tab, setTab] = useState<Tab>("all");
  const [keyword, setKeyword] = useState("");
  const [localSelected, setLocalSelected] = useState<ChatCandidate[]>(selected);
  const channelInfoTick = useChannelInfoTick();
  const requestedInfoRef = useRef<Map<string, number>>(new Map());

  // 打开时重置本地选中态(用 prop 快照)
  useResetOnOpen(open, () => {
    setLocalSelected(selected.map(enrichCandidate));
    setKeyword("");
    setTab("all");
  });

  const { data: candidates, isLoading } = useQuery({
    queryKey: ["summary", "chat-candidates"],
    queryFn: () => getChatCandidates({}),
    enabled: open,
    staleTime: 30 * 1000,
  });

  const enrichedCandidates = useMemo(() => {
    void channelInfoTick;
    return (candidates ?? []).map(enrichCandidate);
  }, [candidates, channelInfoTick]);

  const displayList = useMemo(
    () => buildDisplayList(enrichedCandidates, tab, keyword),
    [enrichedCandidates, tab, keyword],
  );

  const selectedIds = useMemo(() => new Set(localSelected.map((s) => s.chat_id)), [localSelected]);

  const toggle = (item: ChatCandidate) => {
    if (selectedIds.has(item.chat_id)) {
      setLocalSelected((prev) => prev.filter((c) => c.chat_id !== item.chat_id));
    } else if (localSelected.length < maxSelect) {
      setLocalSelected((prev) => [...prev, enrichCandidate(item)]);
    }
  };

  const footer = (
    <div className="flex w-full items-center justify-between">
      <span className="text-xs text-text-tertiary">
        {tr("summary.common.selectedCount", {
          values: { count: localSelected.length, max: maxSelect },
        })}
      </span>
      <div className="flex gap-2">
        <Button type="tertiary" theme="borderless" onClick={onCancel}>
          {tr("summary.common.cancel")}
        </Button>
        <Button
          type="primary"
          theme="solid"
          onClick={() => onConfirm(localSelected.map(enrichCandidate))}
        >
          {tr("summary.common.confirm")}
        </Button>
      </div>
    </div>
  );

  return (
    <BaseDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onCancel();
      }}
      size="md"
      height="md"
      title={tr("summary.chatSelector.title")}
      contentClassName="overflow-hidden"
      footer={footer}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 px-5 py-4">
        <div className="flex shrink-0 items-center gap-2 rounded-md border border-border-default bg-bg-base px-3 py-2">
          <Search size={14} className="shrink-0 text-text-tertiary" />
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder={tr("summary.chatSelector.searchPlaceholder")}
            className="min-w-0 flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none"
          />
        </div>

        <div className="flex shrink-0 gap-1 rounded-md bg-bg-elevated p-1">
          {(Object.keys(TAB_KEY) as Tab[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`flex-1 rounded-sm px-3 py-1 text-xs transition-colors ${
                tab === k
                  ? "bg-bg-surface font-semibold text-text-primary shadow-sm"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {tr(TAB_KEY[k])}
            </button>
          ))}
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {isLoading ? (
            <div className="flex flex-1 items-center justify-center text-xs text-text-tertiary">
              {tr("summary.common.loading")}
            </div>
          ) : (
            <ChatCandidateList
              items={displayList}
              selectedIds={selectedIds}
              onToggle={toggle}
              requestedInfoRef={requestedInfoRef}
              resetKey={`${tab}:${keyword}`}
              empty={
                <div className="flex h-20 items-center justify-center text-xs text-text-tertiary">
                  {tr("summary.chatSelector.noData")}
                </div>
              }
            />
          )}
        </div>
      </div>
    </BaseDialog>
  );
}

function useResetOnOpen(open: boolean, reset: () => void): void {
  useEffect(() => {
    if (open) reset();
    // 仅在 open 0→1 transition 时重置;reset 不进 deps 避免每渲染都跑
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}
