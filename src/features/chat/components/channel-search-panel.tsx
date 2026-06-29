import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ImgHTMLAttributes,
  type RefObject,
} from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  Download,
  FileText,
  Filter,
  ImageIcon,
  LocateFixed,
  MessageSquareText,
  Play,
  Search,
  X,
} from "lucide-react";
import { Channel, ChannelTypeGroup, ChannelTypePerson } from "wukongimjssdk";
import { Button } from "@/components/semi-bridge/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { message } from "@/components/ui/message";
import { ImagePreviewModal } from "@/features/chat/components/image-preview-modal";
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
import { RichTextBlockType, type RichTextBlock } from "@/features/base/im/richtext-content";
import { authStore } from "@/features/base/stores/auth";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { chatSidePanelActions } from "@/features/chat/stores/chat-side-panel";
import { chatLocateMessageActions } from "@/features/chat/stores/chat-locate-message";
import { parseThreadChannelId } from "@/features/base/im/parse-thread-channel-id";
import { FileTypeIcon } from "@/features/chat/file-preview/file-type-icon";
import { triggerDownload } from "@/features/chat/lib/file-download";
import { useRightPanelResize } from "@/features/chat/hooks/use-right-panel-resize.hook";
import { DragOverlay, PanelSplitter } from "@/components/ui/panel-splitter";
import { useT } from "@/lib/i18n/use-t";
import { CHANNEL_TYPE_THREAD, supportsChannelSearch } from "@/features/chat/lib/channel-search";
import {
  tokenizeChannelSearchSnippet,
  type ChannelSearchSnippetToken,
} from "@/features/chat/lib/channel-search-snippet";

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;
const IMAGE_PRELOAD_ROOT_MARGIN = "160px 0px";
const IMAGE_LOAD_BATCH_SIZE = 4;
const IMAGE_LOAD_BATCH_DELAY_MS = 40;
const LOAD_MORE_ROOT_MARGIN = "72px 0px";

const TABS: ChannelSearchTab[] = ["all", "message", "media", "file"];

interface ChannelSearchImageLoadCandidate {
  el: HTMLImageElement;
  load: () => void;
}

interface ChannelSearchImageLoadScheduler {
  register: (candidate: ChannelSearchImageLoadCandidate) => () => void;
}

const ChannelSearchImageLoadContext = createContext<ChannelSearchImageLoadScheduler | null>(null);

interface ChannelSearchPanelProps {
  channel: Channel;
  hidden?: boolean;
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

function useFetchNextChannelSearchPageOnInView(
  rootRef: RefObject<HTMLDivElement | null>,
  ref: RefObject<HTMLDivElement | null>,
  enabled: boolean,
  fetchNextPage: () => unknown,
): void {
  const armedRef = useRef(true);

  useEffect(() => {
    if (!enabled) return;
    const root = rootRef.current;
    const el = ref.current;
    if (!root || !el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const isIntersecting = entries.some((entry) => entry.isIntersecting);
        if (!isIntersecting) {
          armedRef.current = true;
          return;
        }
        if (!armedRef.current) return;
        armedRef.current = false;
        window.requestAnimationFrame(() => {
          void fetchNextPage();
        });
      },
      { root, rootMargin: LOAD_MORE_ROOT_MARGIN },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [enabled, fetchNextPage, ref, rootRef]);
}

function canUseIntersectionObserver(): boolean {
  return typeof window !== "undefined" && "IntersectionObserver" in window;
}

function distanceToRootCenter(root: HTMLElement, el: HTMLElement): number {
  const rootRect = root.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  const rootCenter = rootRect.top + rootRect.height / 2;
  const elCenter = elRect.top + elRect.height / 2;
  return Math.abs(elCenter - rootCenter);
}

function useChannelSearchImageLoadScheduler(
  rootRef: RefObject<HTMLDivElement | null>,
): ChannelSearchImageLoadScheduler {
  const observerRef = useRef<IntersectionObserver | null>(null);
  const registeredRef = useRef(new Map<HTMLImageElement, () => void>());
  const pendingRef = useRef(new Map<HTMLImageElement, () => void>());
  const flushTimerRef = useRef<number | null>(null);

  const flush = useCallback(() => {
    flushTimerRef.current = null;
    const root = rootRef.current;
    if (!root) return;

    const batch = Array.from(pendingRef.current.entries())
      .sort(([a], [b]) => distanceToRootCenter(root, a) - distanceToRootCenter(root, b))
      .slice(0, IMAGE_LOAD_BATCH_SIZE);

    for (const [el, load] of batch) {
      pendingRef.current.delete(el);
      registeredRef.current.delete(el);
      observerRef.current?.unobserve(el);
      load();
    }

    if (pendingRef.current.size > 0) {
      flushTimerRef.current = window.setTimeout(flush, IMAGE_LOAD_BATCH_DELAY_MS);
    }
  }, [rootRef]);

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current !== null) return;
    flushTimerRef.current = window.setTimeout(flush, 0);
  }, [flush]);

  useEffect(() => {
    const registered = registeredRef.current;
    const pending = pendingRef.current;
    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      registered.clear();
      pending.clear();
      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
    };
  }, []);

  const register = useCallback(
    ({ el, load }: ChannelSearchImageLoadCandidate) => {
      if (typeof IntersectionObserver === "undefined") {
        load();
        return () => {};
      }

      registeredRef.current.set(el, load);
      if (!observerRef.current) {
        const root = rootRef.current;
        observerRef.current = new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (!entry.isIntersecting) continue;
              const target = entry.target as HTMLImageElement;
              const registeredLoad = registeredRef.current.get(target);
              if (!registeredLoad) continue;
              pendingRef.current.set(target, registeredLoad);
            }
            if (pendingRef.current.size > 0) scheduleFlush();
          },
          { root, rootMargin: IMAGE_PRELOAD_ROOT_MARGIN },
        );
      }

      observerRef.current.observe(el);
      return () => {
        observerRef.current?.unobserve(el);
        registeredRef.current.delete(el);
        pendingRef.current.delete(el);
      };
    },
    [rootRef, scheduleFlush],
  );

  return useMemo(() => ({ register }), [register]);
}

function useShouldLoadSearchImage(ref: RefObject<HTMLImageElement | null>): boolean {
  const scheduler = useContext(ChannelSearchImageLoadContext);
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    if (shouldLoad) return;
    const el = ref.current;
    if (!scheduler || !el) {
      setShouldLoad(true);
      return;
    }

    return scheduler.register({
      el,
      load: () => setShouldLoad(true),
    });
  }, [ref, scheduler, shouldLoad]);

  return shouldLoad;
}

interface PrioritizedSearchImageProps extends Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  "fetchPriority" | "loading" | "src"
> {
  src: string;
}

function PrioritizedSearchImage({ src, ...props }: PrioritizedSearchImageProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const shouldLoad = useShouldLoadSearchImage(imageRef);
  return (
    <img
      {...props}
      ref={imageRef}
      src={shouldLoad ? src : undefined}
      loading={shouldLoad ? "eager" : "lazy"}
      fetchPriority={shouldLoad ? "high" : "low"}
      decoding="async"
    />
  );
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

export function ChannelSearchPanel({ channel, hidden = false }: ChannelSearchPanelProps) {
  const t = useT();
  const { width, isDragging, panelRef, onSplitterMouseDown, onSplitterDoubleClick } =
    useRightPanelResize();
  const channelKey = `${channel.channelID}_${channel.channelType}`;
  const [activeTab, setActiveTab] = useState<ChannelSearchTab>("all");
  const [keywordInput, setKeywordInput] = useState("");
  const [filters, setFilters] = useState<ChannelSearchFilters>(() => defaultChannelSearchFilters());
  const [filterOpen, setFilterOpen] = useState(false);
  const [senderKeyword, setSenderKeyword] = useState("");
  const [isComposing, setIsComposing] = useState(false);
  const [imagePreviewSrc, setImagePreviewSrc] = useState<string | null>(null);
  const isComposingRef = useRef(false);
  const keywordLimitToastShownRef = useRef(false);
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
  const keywordRuneCount = countChannelSearchKeywordRunes(keywordInput);
  const keywordAtLimit = !isComposing && keywordRuneCount >= CHANNEL_SEARCH_KEYWORD_MAX_RUNES;
  const shouldRun = canSearch && !isComposing && shouldRunChannelSearch(queryInput);

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
  const resultScrollRef = useRef<HTMLDivElement>(null);
  const imageLoadScheduler = useChannelSearchImageLoadScheduler(resultScrollRef);
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);
  const canAutoLoadMore = canUseIntersectionObserver();
  useFetchNextChannelSearchPageOnInView(
    resultScrollRef,
    loadMoreSentinelRef,
    canAutoLoadMore && !hidden && !!searchQuery.hasNextPage && !searchQuery.isFetchingNextPage,
    searchQuery.fetchNextPage,
  );
  const showManualLoadMore =
    !!searchQuery.hasNextPage && (!canAutoLoadMore || searchQuery.isFetchNextPageError);
  const hasFilter = filters.senderUids.length > 0 || !!filters.startAt || !!filters.endAt;

  const onKeywordChange = (next: string) => {
    const nextRuneCount = countChannelSearchKeywordRunes(next);
    if (nextRuneCount > CHANNEL_SEARCH_KEYWORD_MAX_RUNES) {
      setKeywordInput(truncateChannelSearchKeyword(next));
      if (!keywordLimitToastShownRef.current) {
        message.warning(
          t("channelSearch.keywordLimitToast", {
            values: { count: CHANNEL_SEARCH_KEYWORD_MAX_RUNES },
          }),
        );
        keywordLimitToastShownRef.current = true;
      }
      return;
    }
    if (nextRuneCount < CHANNEL_SEARCH_KEYWORD_MAX_RUNES) {
      keywordLimitToastShownRef.current = false;
    }
    setKeywordInput(next);
  };

  return (
    <>
      <aside
        ref={panelRef}
        style={{ width }}
        className={`relative h-full shrink-0 flex-col border-l border-border-default bg-bg-base ${hidden ? "hidden" : "flex"}`}
      >
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border-subtle bg-bg-surface px-3">
          <Search size={18} className="shrink-0 text-text-tertiary" />
          <input
            autoFocus
            value={keywordInput}
            onCompositionStart={() => {
              isComposingRef.current = true;
              setIsComposing(true);
            }}
            onCompositionEnd={(event) => {
              isComposingRef.current = false;
              setIsComposing(false);
              onKeywordChange(event.currentTarget.value);
            }}
            onChange={(event) => {
              if (isComposingRef.current) {
                setKeywordInput(event.target.value);
                return;
              }
              onKeywordChange(event.target.value);
            }}
            placeholder={t("channelSearch.placeholder")}
            className="min-w-0 flex-1 border-0 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-tertiary"
          />
          {keywordAtLimit ? (
            <span role="status" aria-live="polite" className="shrink-0 text-xs text-text-tertiary">
              {t("channelSearch.keywordLimitHint", {
                values: { count: CHANNEL_SEARCH_KEYWORD_MAX_RUNES },
              })}
            </span>
          ) : null}
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

        <div ref={resultScrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          <ChannelSearchImageLoadContext.Provider value={imageLoadScheduler}>
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
              <div className={activeTab === "media" ? "space-y-4" : "space-y-2"}>
                {activeTab === "media" ? (
                  <MediaResultGrid items={items} onOpenImagePreview={setImagePreviewSrc} />
                ) : activeTab === "file" ? (
                  <FileResultList items={items} keyword={keyword} />
                ) : (
                  items.map((item) => (
                    <SearchResultItem
                      key={`${item.kind}-${item.id}-${item.messageSeq}`}
                      item={item}
                      keyword={keyword}
                      onOpenImagePreview={setImagePreviewSrc}
                    />
                  ))
                )}
                <div ref={loadMoreSentinelRef} aria-hidden="true" className="h-px" />
                {searchQuery.isFetchingNextPage && !showManualLoadMore ? (
                  <div className="py-2 text-center text-xs text-text-tertiary">
                    {t("channelSearch.loading")}
                  </div>
                ) : null}
                {showManualLoadMore ? (
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
                ) : searchQuery.hasNextPage ? null : (
                  <div className="py-2 text-center text-xs text-text-tertiary">
                    {t("filePreview.noMore")}
                  </div>
                )}
              </div>
            )}
          </ChannelSearchImageLoadContext.Provider>
        </div>

        <PanelSplitter
          side="left"
          isDragging={isDragging}
          onMouseDown={onSplitterMouseDown}
          onDoubleClick={onSplitterDoubleClick}
        />
        {isDragging ? <DragOverlay /> : null}
      </aside>
      {imagePreviewSrc ? (
        <ImagePreviewModal src={imagePreviewSrc} onClose={() => setImagePreviewSrc(null)} />
      ) : null}
    </>
  );
}

function getImagePreviewUrl(item: ChannelSearchItem): string | undefined {
  if (item.kind !== "image") return undefined;
  return (
    item.media?.url || item.media?.previewUrl || item.media?.downloadUrl || item.media?.thumbUrl
  );
}

function getVideoPreviewUrl(item: ChannelSearchItem): string | undefined {
  if (item.kind !== "video") return undefined;
  return item.media?.url || item.media?.previewUrl || item.media?.downloadUrl;
}

function openVideoPreview(item: ChannelSearchItem): void {
  const mediaUrl = getVideoPreviewUrl(item);
  if (!mediaUrl) return;
  chatSidePanelActions.openFilePreview({
    url: mediaUrl,
    name: "video.mp4",
    ext: "mp4",
    messageId: item.messageId,
    messageSeq: item.messageSeq,
    fromUID: item.senderUid,
    conversationDigest: item.text,
    sourceChannelId: item.channelId,
    sourceChannelType: item.channelType,
  });
}

function openFilePreview(item: ChannelSearchItem, fallbackName: string): void {
  if (!item.file?.url) return;
  chatSidePanelActions.openFilePreview({
    url: item.file.url,
    name: item.file.name || fallbackName,
    ext: item.file.extension || "",
    size: item.file.size,
    messageId: item.messageId,
    messageSeq: item.messageSeq,
    fromUID: item.senderUid,
    conversationDigest: item.text,
    sourceChannelId: item.channelId,
    sourceChannelType: item.channelType,
  });
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

function SearchResultItem({
  item,
  keyword,
  onOpenImagePreview,
}: {
  item: ChannelSearchItem;
  keyword: string;
  onOpenImagePreview: (src: string) => void;
}) {
  const t = useT();
  const channel = new Channel(item.channelId || "", item.channelType || 0);
  const canLocate = !!item.messageSeq && !!item.channelId && item.channelType != null;
  const openPreview = () => {
    if (item.file?.url) {
      openFilePreview(item, t("channelSearch.tabs.file"));
      return;
    }
    const imageUrl = getImagePreviewUrl(item);
    if (imageUrl) {
      onOpenImagePreview(imageUrl);
      return;
    }
    if (getVideoPreviewUrl(item)) {
      openVideoPreview(item);
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
      <ResultBody item={item} keyword={keyword} onPreview={openPreview} />
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

function FileResultList({ items, keyword }: { items: ChannelSearchItem[]; keyword: string }) {
  const t = useT();
  const fileItems = useMemo(
    () => items.filter((item) => item.kind === "file" && item.file),
    [items],
  );

  if (fileItems.length === 0) {
    return <EmptyState text={t("channelSearch.noResults")} />;
  }

  return (
    <div className="space-y-1 px-1 pb-2">
      {fileItems.map((item) => (
        <FileCompactItem
          key={`${item.kind}-${item.id}-${item.messageSeq}`}
          item={item}
          keyword={keyword}
        />
      ))}
    </div>
  );
}

function FileCompactItem({ item, keyword }: { item: ChannelSearchItem; keyword: string }) {
  const t = useT();
  const channel = new Channel(item.channelId || "", item.channelType || 0);
  const fileName = item.file?.name || t("channelSearch.tabs.file");
  const canLocate = !!item.messageSeq && !!item.channelId && item.channelType != null;
  const downloadUrl = item.file?.downloadUrl || item.file?.url;
  const preview = () => openFilePreview(item, t("channelSearch.tabs.file"));

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={preview}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        preview();
      }}
      className="group flex min-h-14 cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-bg-hover focus-visible:bg-bg-hover focus-visible:outline-none"
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md">
        <FileTypeIcon extension={item.file?.extension || fileName} size={40} />
      </div>
      <div className="min-w-0 flex-1">
        <ChannelSearchSnippetText
          text={fileName}
          keyword={keyword}
          className="truncate text-sm leading-5 text-text-primary"
        />
        <div className="flex min-w-0 items-center gap-1 text-xs leading-5 text-text-tertiary">
          <span className="truncate">{item.sender?.name || item.senderUid}</span>
          <span className="shrink-0">·</span>
          <span className="shrink-0">{compactFileSize(item.file?.size ?? 0)}</span>
          <span className="shrink-0">·</span>
          <span className="shrink-0">{formatDate(item.timestamp)}</span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 focus-within:opacity-100">
        {canLocate ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={t("channelSearch.locateToChat")}
                onClick={(event) => {
                  event.stopPropagation();
                  chatLocateMessageActions.request(channel, item.messageSeq, {
                    strategy: "window",
                  });
                }}
                className="flex h-7 w-7 items-center justify-center rounded-md text-text-secondary hover:bg-bg-elevated hover:text-text-primary"
              >
                <LocateFixed size={15} />
              </button>
            </TooltipTrigger>
            <TooltipContent>{t("channelSearch.locateToChat")}</TooltipContent>
          </Tooltip>
        ) : null}
        {downloadUrl ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={t("filePreview.download")}
                onClick={(event) => {
                  event.stopPropagation();
                  void triggerDownload(downloadUrl, fileName);
                }}
                className="flex h-7 w-7 items-center justify-center rounded-md text-text-secondary hover:bg-bg-elevated hover:text-text-primary"
              >
                <Download size={15} />
              </button>
            </TooltipTrigger>
            <TooltipContent>{t("filePreview.download")}</TooltipContent>
          </Tooltip>
        ) : null}
      </div>
    </div>
  );
}

function MediaResultGrid({
  items,
  onOpenImagePreview,
}: {
  items: ChannelSearchItem[];
  onOpenImagePreview: (src: string) => void;
}) {
  const mediaItems = useMemo(
    () => items.filter((item) => (item.kind === "image" || item.kind === "video") && item.media),
    [items],
  );
  const grouped = useMemo(() => {
    return mediaItems.reduce<Record<string, ChannelSearchItem[]>>((acc, item) => {
      const label = item.media?.monthBucket || formatMonth(item.timestamp);
      acc[label] = acc[label] || [];
      acc[label].push(item);
      return acc;
    }, {});
  }, [mediaItems]);

  return (
    <div className="space-y-6 px-1 pb-2">
      {Object.entries(grouped).map(([label, groupItems]) => (
        <section key={label}>
          <div className="mb-2 text-sm font-medium text-text-tertiary">{label}</div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-2">
            {groupItems.map((item) => (
              <MediaGridItem
                key={`${item.kind}-${item.id}-${item.messageSeq}`}
                item={item}
                onOpenImagePreview={onOpenImagePreview}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function MediaGridItem({
  item,
  onOpenImagePreview,
}: {
  item: ChannelSearchItem;
  onOpenImagePreview: (src: string) => void;
}) {
  const t = useT();
  const channel = new Channel(item.channelId || "", item.channelType || 0);
  const canLocate = !!item.messageSeq && !!item.channelId && item.channelType != null;
  const thumbUrl = item.media?.thumbUrl || item.media?.url || item.media?.previewUrl;
  const imageUrl = getImagePreviewUrl(item);
  const videoUrl = getVideoPreviewUrl(item);
  const canPreview = !!(imageUrl || videoUrl);
  const openPreview = () => {
    if (imageUrl) {
      onOpenImagePreview(imageUrl);
      return;
    }
    openVideoPreview(item);
  };

  return (
    <div className="group relative aspect-square min-w-0 overflow-hidden rounded-[5px] bg-bg-elevated shadow-[0_0_12px_rgba(15,23,42,0.14)]">
      <button
        type="button"
        disabled={!canPreview}
        aria-label={
          item.kind === "video" ? t("channelSearch.media.video") : t("channelSearch.media.image")
        }
        onClick={openPreview}
        className="absolute inset-0 flex items-center justify-center disabled:cursor-default"
      >
        {thumbUrl ? (
          <PrioritizedSearchImage
            src={thumbUrl}
            alt=""
            draggable={false}
            className="h-full w-full object-contain"
          />
        ) : (
          <ImageIcon size={24} className="text-text-tertiary" />
        )}
      </button>
      {item.kind === "video" ? (
        <div className="pointer-events-none absolute left-1/2 top-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white">
          <Play size={18} fill="currentColor" />
        </div>
      ) : null}
      {canLocate ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={t("channelSearch.locateToChat")}
              onClick={() =>
                chatLocateMessageActions.request(channel, item.messageSeq, { strategy: "window" })
              }
              className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition-opacity hover:bg-black/60 group-hover:opacity-100 focus-visible:opacity-100"
            >
              <LocateFixed size={14} />
            </button>
          </TooltipTrigger>
          <TooltipContent>{t("channelSearch.locateToChat")}</TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );
}

function ResultBody({
  item,
  keyword,
  onPreview,
}: {
  item: ChannelSearchItem;
  keyword: string;
  onPreview: () => void;
}) {
  const t = useT();
  if (item.richText) {
    return (
      <RichTextSearchBody blocks={item.richText.content} fallback={item.text} keyword={keyword} />
    );
  }
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
    const thumbUrl = item.media.thumbUrl || item.media.url;
    return (
      <button
        type="button"
        onClick={onPreview}
        className="flex w-full items-center gap-3 rounded-md bg-bg-elevated p-2 text-left"
      >
        <div className="flex h-16 w-20 shrink-0 items-center justify-center overflow-hidden rounded bg-bg-base">
          {thumbUrl ? (
            <PrioritizedSearchImage src={thumbUrl} alt="" className="h-full w-full object-cover" />
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
    <ChannelSearchSnippetText
      text={item.text || t("channelSearch.empty")}
      keyword={keyword}
      className="break-words text-sm leading-6 text-text-primary"
    />
  );
}

function RichTextSearchBody({
  blocks,
  fallback,
  keyword,
}: {
  blocks: RichTextBlock[];
  fallback?: string;
  keyword: string;
}) {
  const t = useT();
  const visibleBlocks = blocks.slice(0, 4);
  if (visibleBlocks.length === 0) {
    return (
      <ChannelSearchSnippetText
        text={fallback || t("message.digest.richText")}
        keyword={keyword}
        className="break-words text-sm leading-6 text-text-primary"
      />
    );
  }
  return (
    <div className="space-y-2 rounded-md bg-bg-elevated p-2">
      {visibleBlocks.map((block, index) => {
        if (block.type === RichTextBlockType.image) {
          return (
            <RichTextSearchImage key={`rich-image-${index}-${block.url ?? ""}`} block={block} />
          );
        }
        if (block.type === RichTextBlockType.file) {
          return (
            <RichTextSearchFile key={`rich-file-${index}-${block.name ?? ""}`} block={block} />
          );
        }
        const text = block.text || "";
        if (!text) return null;
        return (
          <ChannelSearchSnippetText
            key={`rich-text-${index}-${text.slice(0, 8)}`}
            text={text}
            keyword={keyword}
            className="line-clamp-3 break-words text-sm leading-6 text-text-primary"
          />
        );
      })}
      {blocks.length > visibleBlocks.length ? (
        <div className="text-xs text-text-tertiary">{t("channelSearch.richText.more")}</div>
      ) : null}
    </div>
  );
}

function ChannelSearchSnippetText({
  text,
  keyword,
  className,
}: {
  text: string;
  keyword: string;
  className: string;
}) {
  const tokens = tokenizeChannelSearchSnippet(text, keyword);
  return (
    <div className={className}>
      {tokens.map((token, index) => (
        <ChannelSearchSnippetNode key={`${token.type}-${index}`} token={token} />
      ))}
    </div>
  );
}

function ChannelSearchSnippetNode({ token }: { token: ChannelSearchSnippetToken }) {
  if (token.type === "emoji") {
    const emoji = (
      <span className="inline-flex h-[18px] w-[18px] items-center justify-center align-sub">
        <img src={token.url} alt={token.key} className="h-[18px] w-[18px]" draggable={false} />
      </span>
    );
    if (!token.highlighted) return emoji;
    return <mark className="bg-warning/30 text-text-primary">{emoji}</mark>;
  }

  if (!token.highlighted) return <>{token.text}</>;
  return <mark className="bg-warning/30 text-text-primary">{token.text}</mark>;
}

function RichTextSearchImage({ block }: { block: RichTextBlock }) {
  const t = useT();
  if (!block.url) {
    return (
      <span className="inline-flex w-fit rounded bg-bg-base px-2 py-1 text-xs text-text-tertiary">
        {t("message.digest.image")}
      </span>
    );
  }
  return (
    <div className="flex h-16 w-20 items-center justify-center overflow-hidden rounded bg-bg-base">
      <PrioritizedSearchImage
        src={block.url}
        alt={block.name || ""}
        className="h-full w-full object-cover"
      />
    </div>
  );
}

function RichTextSearchFile({ block }: { block: RichTextBlock }) {
  const t = useT();
  return (
    <div className="inline-flex max-w-full items-center gap-2 rounded bg-bg-base px-2 py-1 text-xs text-text-secondary">
      <FileText size={13} className="shrink-0 text-text-tertiary" />
      <span className="truncate">{block.name || t("message.digest.file")}</span>
    </div>
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

function formatDate(seconds: number): string {
  if (!seconds) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(seconds * 1000));
}

function formatMonth(seconds: number): string {
  if (!seconds) return "";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "2-digit",
  }).format(new Date(seconds * 1000));
}

function compactFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1).replace(/\.0$/, "")}MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1).replace(/\.0$/, "")}KB`;
  return `${bytes}B`;
}
