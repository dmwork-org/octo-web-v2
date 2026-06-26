import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Download, FileText, Filter, ImageIcon, MessageSquareText, Search, X } from "lucide-react";
import { Channel, ChannelTypeGroup, ChannelTypePerson } from "wukongimjssdk";
import { Button } from "@/components/semi-bridge/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { message } from "@/components/ui/message";
import {
  CHANNEL_SEARCH_KEYWORD_MAX_RUNES,
  countChannelSearchKeywordRunes,
  defaultChannelSearchFilters,
  searchChannelMessages,
  shouldRunChannelSearch,
  truncateChannelSearchKeyword,
  type ChannelSearchFilters,
  type ChannelSearchItem,
  type ChannelSearchResponse,
  type ChannelSearchSender,
  type ChannelSearchTab,
} from "@/features/base/api/endpoints/search.api";
import { syncGroupMembers } from "@/features/base/api/endpoints/group.api";
import { authStore } from "@/features/base/stores/auth";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { chatSidePanelActions } from "@/features/chat/stores/chat-side-panel";
import { chatLocateMessageActions } from "@/features/chat/stores/chat-locate-message";
import { parseThreadChannelId } from "@/features/base/im/parse-thread-channel-id";
import { FileTypeIcon } from "@/features/chat/file-preview/file-type-icon";
import { triggerDownload } from "@/features/chat/lib/file-download";
import { sanitizeHighlight } from "@/features/base/lib/sanitize-highlight";
import { useRightPanelResize } from "@/features/chat/hooks/use-right-panel-resize.hook";
import { DragOverlay, PanelSplitter } from "@/components/ui/panel-splitter";
import { useT } from "@/lib/i18n/use-t";
import { CHANNEL_TYPE_THREAD, supportsChannelSearch } from "@/features/chat/lib/channel-search";

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;

const TABS: ChannelSearchTab[] = ["all", "message", "media", "file"];

interface ChannelSearchPanelProps {
  channel: Channel;
}

function useDebouncedValue<T>(value: T, delay = SEARCH_DEBOUNCE_MS): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [delay, value]);
  return debounced;
}

function useResetChannelSearchOnChannelChange(
  channelKey: string,
  setActiveTab: (value: ChannelSearchTab) => void,
  setKeywordInput: (value: string) => void,
  setFilters: (value: ChannelSearchFilters) => void,
  setFilterOpen: (value: boolean) => void,
  setSenderKeyword: (value: string) => void,
): void {
  useEffect(() => {
    setActiveTab("all");
    setKeywordInput("");
    setFilters(defaultChannelSearchFilters());
    setFilterOpen(false);
    setSenderKeyword("");
  }, [channelKey, setActiveTab, setFilterOpen, setFilters, setKeywordInput, setSenderKeyword]);
}

function parentGroupNo(channel: Channel): string | null {
  if (channel.channelType === ChannelTypeGroup) return channel.channelID;
  if (channel.channelType !== CHANNEL_TYPE_THREAD) return null;
  return parseThreadChannelId(channel.channelID)?.groupNo ?? null;
}

function senderSearchQueryOptions(channel: Channel, keyword: string) {
  const normalized = keyword.trim().toLowerCase();
  const groupNo = parentGroupNo(channel);
  return {
    queryKey: [
      "chat",
      "channel-search",
      "senders",
      channel.channelID,
      channel.channelType,
      keyword,
    ],
    queryFn: async (): Promise<ChannelSearchSender[]> => {
      if (channel.channelType === ChannelTypePerson) {
        const me = authStore.state.user;
        const own: ChannelSearchSender | null = me
          ? { uid: me.uid, name: me.name || me.username || me.uid }
          : null;
        const peer: ChannelSearchSender = { uid: channel.channelID, name: channel.channelID };
        return [own, peer].filter((s): s is ChannelSearchSender => {
          if (!s) return false;
          return `${s.name}${s.uid}`.toLowerCase().includes(normalized);
        });
      }
      if (!groupNo) return [];
      const members = await syncGroupMembers(groupNo, 0, 10000);
      return members
        .map((member) => ({
          uid: member.uid,
          name: member.remark || member.name || member.uid,
        }))
        .filter((sender) => `${sender.name}${sender.uid}`.toLowerCase().includes(normalized))
        .slice(0, 50);
    },
    staleTime: 30 * 1000,
  };
}

export function ChannelSearchPanel({ channel }: ChannelSearchPanelProps) {
  const t = useT();
  const { width, isDragging, panelRef, onSplitterMouseDown, onSplitterDoubleClick } =
    useRightPanelResize();
  const channelKey = `${channel.channelID}_${channel.channelType}`;
  const [activeTab, setActiveTab] = useState<ChannelSearchTab>("all");
  const [keywordInput, setKeywordInput] = useState("");
  const [filters, setFilters] = useState<ChannelSearchFilters>(() => defaultChannelSearchFilters());
  const [filterOpen, setFilterOpen] = useState(false);
  const [senderKeyword, setSenderKeyword] = useState("");
  const keyword = useDebouncedValue(keywordInput.trim());

  useResetChannelSearchOnChannelChange(
    channelKey,
    setActiveTab,
    setKeywordInput,
    setFilters,
    setFilterOpen,
    setSenderKeyword,
  );

  const canSearch = supportsChannelSearch(channel);
  const queryInput = useMemo(
    () => ({
      channelId: channel.channelID,
      channelType: channel.channelType,
      keyword,
      tab: activeTab,
      filters,
      limit: PAGE_SIZE,
    }),
    [activeTab, channel.channelID, channel.channelType, filters, keyword],
  );
  const shouldRun = canSearch && shouldRunChannelSearch(queryInput);

  const searchQuery = useInfiniteQuery({
    queryKey: ["chat", "channel-search", queryInput],
    initialPageParam: "",
    enabled: shouldRun,
    queryFn: ({ pageParam }) => searchChannelMessages({ ...queryInput, cursor: pageParam }),
    getNextPageParam: (last: ChannelSearchResponse) =>
      last.hasMore ? last.nextCursor || "" : null,
    staleTime: 5 * 1000,
  });

  const senderQuery = useQuery({
    ...senderSearchQueryOptions(channel, senderKeyword),
    enabled: filterOpen,
  });

  const items = useMemo(
    () => searchQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [searchQuery.data],
  );
  const hasFilter = filters.senderUids.length > 0 || !!filters.startAt || !!filters.endAt;

  const onKeywordChange = (next: string) => {
    if (countChannelSearchKeywordRunes(next) > CHANNEL_SEARCH_KEYWORD_MAX_RUNES) {
      setKeywordInput(truncateChannelSearchKeyword(next));
      message.warning(
        t("channelSearch.keywordLimitToast", {
          values: { count: CHANNEL_SEARCH_KEYWORD_MAX_RUNES },
        }),
      );
      return;
    }
    setKeywordInput(next);
  };

  return (
    <aside
      ref={panelRef}
      style={{ width }}
      className="relative flex h-full shrink-0 flex-col border-l border-border-default bg-bg-base"
    >
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border-subtle bg-bg-surface px-3">
        <Search size={18} className="shrink-0 text-text-tertiary" />
        <input
          autoFocus
          value={keywordInput}
          onChange={(event) => onKeywordChange(event.target.value)}
          placeholder={t("channelSearch.placeholder")}
          className="min-w-0 flex-1 border-0 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-tertiary"
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={t("channelSearch.filter.title")}
              onClick={() => setFilterOpen((v) => !v)}
              className={`relative flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-bg-hover ${
                filterOpen || hasFilter ? "text-brand" : "text-text-secondary"
              }`}
            >
              <Filter size={17} />
              {hasFilter ? (
                <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-brand" />
              ) : null}
            </button>
          </TooltipTrigger>
          <TooltipContent>{t("channelSearch.filter.title")}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={t("channelSearch.close")}
              onClick={() => chatSidePanelActions.close()}
              className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
            >
              <X size={18} />
            </button>
          </TooltipTrigger>
          <TooltipContent>{t("channelSearch.close")}</TooltipContent>
        </Tooltip>
      </header>

      {filterOpen ? (
        <FilterPanel
          filters={filters}
          senders={senderQuery.data ?? []}
          senderKeyword={senderKeyword}
          onSenderKeywordChange={setSenderKeyword}
          onChange={setFilters}
          onClear={() => setFilters(defaultChannelSearchFilters())}
        />
      ) : null}

      <div className="flex shrink-0 gap-1 border-b border-border-subtle bg-bg-surface px-3 py-2">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`h-8 rounded-md px-3 text-sm transition-colors ${
              activeTab === tab
                ? "bg-brand text-white"
                : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
            }`}
          >
            {t(`channelSearch.tabs.${tab}`)}
          </button>
        ))}
      </div>

      {activeTab === "media" && keyword ? (
        <div className="border-b border-border-subtle px-3 py-2 text-xs text-text-tertiary">
          {t("channelSearch.mediaKeywordTip")}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {!canSearch ? (
          <EmptyState text={t("channelSearch.unsupported")} />
        ) : !shouldRun ? (
          <EmptyState text={t("channelSearch.emptyHint")} />
        ) : searchQuery.isLoading ? (
          <LoadingState text={t("channelSearch.loading")} />
        ) : searchQuery.isError ? (
          <ErrorState
            text={t("channelSearch.searchFailed")}
            onRetry={() => searchQuery.refetch()}
          />
        ) : items.length === 0 ? (
          <EmptyState text={t("channelSearch.noResults")} />
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <SearchResultItem key={`${item.kind}-${item.id}-${item.messageSeq}`} item={item} />
            ))}
            {searchQuery.hasNextPage ? (
              <Button
                type="tertiary"
                theme="borderless"
                size="small"
                className="w-full"
                loading={searchQuery.isFetchingNextPage}
                onClick={() => searchQuery.fetchNextPage()}
              >
                {t("channelSearch.loadMore")}
              </Button>
            ) : (
              <div className="py-2 text-center text-xs text-text-tertiary">
                {t("filePreview.noMore")}
              </div>
            )}
          </div>
        )}
      </div>

      <PanelSplitter
        side="left"
        isDragging={isDragging}
        onMouseDown={onSplitterMouseDown}
        onDoubleClick={onSplitterDoubleClick}
      />
      {isDragging ? <DragOverlay /> : null}
    </aside>
  );
}

function FilterPanel({
  filters,
  senders,
  senderKeyword,
  onSenderKeywordChange,
  onChange,
  onClear,
}: {
  filters: ChannelSearchFilters;
  senders: ChannelSearchSender[];
  senderKeyword: string;
  onSenderKeywordChange: (value: string) => void;
  onChange: (filters: ChannelSearchFilters) => void;
  onClear: () => void;
}) {
  const t = useT();
  const toggleSender = (uid: string) => {
    const set = new Set(filters.senderUids);
    if (set.has(uid)) set.delete(uid);
    else set.add(uid);
    onChange({ ...filters, senderUids: Array.from(set) });
  };
  return (
    <div className="shrink-0 border-b border-border-subtle bg-bg-surface px-3 py-3">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-medium text-text-primary">
          {t("channelSearch.filter.title")}
        </div>
        <button type="button" onClick={onClear} className="text-xs text-text-accent">
          {t("channelSearch.filter.clear")}
        </button>
      </div>
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs text-text-tertiary">
            {t("channelSearch.filter.sender")}
          </span>
          <input
            value={senderKeyword}
            onChange={(event) => onSenderKeywordChange(event.target.value)}
            placeholder={t("channelSearch.filter.senderPlaceholder")}
            className="h-8 w-full rounded-md border border-border-default bg-bg-base px-2 text-sm outline-none focus:border-brand"
          />
        </label>
        {senders.length > 0 ? (
          <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto">
            {senders.map((sender) => (
              <button
                key={sender.uid}
                type="button"
                onClick={() => toggleSender(sender.uid)}
                className={`rounded-md border px-2 py-1 text-xs ${
                  filters.senderUids.includes(sender.uid)
                    ? "border-brand bg-[rgba(107,61,216,0.08)] text-brand"
                    : "border-border-subtle text-text-secondary hover:bg-bg-hover"
                }`}
              >
                {sender.name}
              </button>
            ))}
          </div>
        ) : null}
        <label className="block">
          <span className="mb-1 block text-xs text-text-tertiary">
            {t("channelSearch.filter.sort")}
          </span>
          <select
            value={filters.sort}
            onChange={(event) =>
              onChange({ ...filters, sort: event.target.value as ChannelSearchFilters["sort"] })
            }
            className="h-8 w-full rounded-md border border-border-default bg-bg-base px-2 text-sm outline-none focus:border-brand"
          >
            <option value="time_desc">{t("channelSearch.filter.timeDesc")}</option>
            <option value="time_asc">{t("channelSearch.filter.timeAsc")}</option>
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <DateInput
            label={t("channelSearch.filter.startDate")}
            value={filters.startAt}
            onChange={(value) => onChange({ ...filters, startAt: value })}
          />
          <DateInput
            label={t("channelSearch.filter.endDate")}
            value={filters.endAt}
            endOfDay
            onChange={(value) => onChange({ ...filters, endAt: value })}
          />
        </div>
      </div>
    </div>
  );
}

function DateInput({
  label,
  value,
  endOfDay,
  onChange,
}: {
  label: string;
  value?: number;
  endOfDay?: boolean;
  onChange: (value: number | undefined) => void;
}) {
  const dateValue = value ? new Date(value * 1000).toISOString().slice(0, 10) : "";
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-text-tertiary">{label}</span>
      <input
        type="date"
        value={dateValue}
        onChange={(event) => {
          if (!event.target.value) {
            onChange(undefined);
            return;
          }
          const date = new Date(`${event.target.value}T00:00:00`);
          if (endOfDay) date.setHours(23, 59, 59, 999);
          onChange(Math.floor(date.getTime() / 1000));
        }}
        className="h-8 w-full rounded-md border border-border-default bg-bg-base px-2 text-sm outline-none focus:border-brand"
      />
    </label>
  );
}

function SearchResultItem({ item }: { item: ChannelSearchItem }) {
  const t = useT();
  const channel = new Channel(item.channelId || "", item.channelType || 0);
  const canLocate = !!item.messageSeq && !!item.channelId && item.channelType != null;
  const openPreview = () => {
    if (item.file?.url) {
      chatSidePanelActions.openFilePreview({
        url: item.file.url,
        name: item.file.name || t("channelSearch.tabs.file"),
        ext: item.file.extension || "",
        size: item.file.size,
        messageId: item.messageId,
        messageSeq: item.messageSeq,
        fromUID: item.senderUid,
        conversationDigest: item.text,
        sourceChannelId: item.channelId,
        sourceChannelType: item.channelType,
      });
      return;
    }
    if (item.media?.url) {
      chatSidePanelActions.openFilePreview({
        url: item.media.url,
        name: item.kind === "video" ? "video.mp4" : "image.png",
        ext: item.kind === "video" ? "mp4" : "png",
        messageId: item.messageId,
        messageSeq: item.messageSeq,
        fromUID: item.senderUid,
        conversationDigest: item.text,
        sourceChannelId: item.channelId,
        sourceChannelType: item.channelType,
      });
    }
  };
  return (
    <article className="group rounded-md border border-border-subtle bg-bg-surface p-3 transition-colors hover:border-border-default">
      <div className="mb-2 flex items-center gap-2">
        {item.senderUid ? (
          <ChannelAvatar channel={new Channel(item.senderUid, ChannelTypePerson)} size={24} />
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-text-primary">
            {item.sender?.name || item.senderUid || t("messageRow.webhookFallbackName")}
          </div>
          <div className="text-xs text-text-tertiary">{formatTime(item.timestamp)}</div>
        </div>
        <KindIcon kind={item.kind} />
      </div>
      <ResultBody item={item} onPreview={openPreview} />
      <div className="mt-3 flex items-center justify-between">
        <button
          type="button"
          disabled={!canLocate}
          onClick={() => {
            if (!canLocate) return;
            chatLocateMessageActions.request(channel, item.messageSeq, { strategy: "window" });
          }}
          className="text-xs text-text-accent disabled:text-text-disabled"
        >
          {t("channelSearch.locateToChat")}
        </button>
        {item.file?.downloadUrl ? (
          <button
            type="button"
            onClick={() => void triggerDownload(item.file!.downloadUrl!, item.file!.name)}
            className="flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary"
          >
            <Download size={13} />
            {t("filePreview.download")}
          </button>
        ) : null}
      </div>
    </article>
  );
}

function ResultBody({ item, onPreview }: { item: ChannelSearchItem; onPreview: () => void }) {
  const t = useT();
  if (item.kind === "file" && item.file) {
    return (
      <button
        type="button"
        onClick={onPreview}
        className="flex w-full items-center gap-2 rounded-md bg-bg-elevated p-2 text-left"
      >
        <FileTypeIcon extension={item.file.extension || item.file.name} size={28} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm text-text-primary">{item.file.name}</div>
          <div className="text-xs text-text-tertiary">{compactFileSize(item.file.size)}</div>
        </div>
      </button>
    );
  }
  if ((item.kind === "image" || item.kind === "video") && item.media) {
    return (
      <button
        type="button"
        onClick={onPreview}
        className="flex w-full items-center gap-3 rounded-md bg-bg-elevated p-2 text-left"
      >
        <div className="flex h-16 w-20 shrink-0 items-center justify-center overflow-hidden rounded bg-bg-base">
          {item.media.thumbUrl || item.media.url ? (
            <img
              src={item.media.thumbUrl || item.media.url}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <ImageIcon size={22} className="text-text-tertiary" />
          )}
        </div>
        <div className="min-w-0 flex-1 text-sm text-text-primary">
          {item.kind === "video" ? t("channelSearch.media.video") : t("channelSearch.media.image")}
          {item.media.monthBucket ? (
            <div className="mt-1 text-xs text-text-tertiary">{item.media.monthBucket}</div>
          ) : null}
        </div>
      </button>
    );
  }
  if (item.kind === "merge_forward" && item.forward) {
    return (
      <div className="rounded-md bg-bg-elevated p-2">
        <div className="mb-1 text-sm font-medium text-text-primary">
          {item.forward.title || t("channelSearch.forward.defaultTitle")}
        </div>
        {item.forward.innerMessages?.slice(0, 3).map((inner) => (
          <div
            key={`${inner.messageId}-${inner.timestamp}`}
            className="truncate text-xs text-text-secondary"
          >
            {inner.senderName ? `${inner.senderName}: ` : ""}
            {inner.text || t("channelSearch.forward.placeholder.message")}
          </div>
        ))}
        {item.forward.childCount ? (
          <div className="mt-1 text-xs text-text-tertiary">
            {t("channelSearch.forward.childCount", { values: { count: item.forward.childCount } })}
          </div>
        ) : null}
      </div>
    );
  }
  return (
    <div
      className="break-words text-sm leading-6 text-text-primary"
      dangerouslySetInnerHTML={{ __html: sanitizeHighlight(item.text || t("channelSearch.empty")) }}
    />
  );
}

function KindIcon({ kind }: { kind: ChannelSearchItem["kind"] }) {
  if (kind === "file") return <FileText size={16} className="text-text-tertiary" />;
  if (kind === "image" || kind === "video") {
    return <ImageIcon size={16} className="text-text-tertiary" />;
  }
  return <MessageSquareText size={16} className="text-text-tertiary" />;
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex h-full min-h-52 flex-col items-center justify-center gap-2 text-center text-sm text-text-tertiary">
      <Search size={26} />
      <span>{text}</span>
    </div>
  );
}

function LoadingState({ text }: { text: string }) {
  return (
    <div className="flex h-full min-h-52 flex-col items-center justify-center gap-2 text-sm text-text-tertiary">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-border-default border-t-brand" />
      <span>{text}</span>
    </div>
  );
}

function ErrorState({ text, onRetry }: { text: string; onRetry: () => void }) {
  const t = useT();
  return (
    <div className="flex h-full min-h-52 flex-col items-center justify-center gap-3 text-sm text-text-tertiary">
      <span>{text}</span>
      <Button type="tertiary" theme="borderless" size="small" onClick={onRetry}>
        {t("filePreview.retry")}
      </Button>
    </div>
  );
}

function formatTime(seconds: number): string {
  if (!seconds) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(seconds * 1000));
}

function compactFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1).replace(/\.0$/, "")}MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1).replace(/\.0$/, "")}KB`;
  return `${bytes}B`;
}
