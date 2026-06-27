import { api } from "@/features/base/api/client";
import {
  RichTextBlockType,
  buildRichTextPlain,
  type RichTextBlock,
} from "@/features/base/im/richtext-content";
import { endpointStore } from "@/features/base/stores/endpoint";
import { spaceStore } from "@/features/base/stores/space";

/**
 * 全局搜索(对应旧 dmworkbase Components/GlobalSearch/vm::requestSearch):
 *
 * POST /v1/search/global?space_id={?}
 * body: { keyword, page, limit, content_type, channel_id?, channel_type?, only_message? }
 *
 * 响应三段(任一可能为空数组):
 *   friends:  匹配的联系人(channel_id 即 uid,channel_type=1)
 *   groups:   匹配的群组
 *   messages: 匹配的消息(payload 是原 SDK content encode 后的 JSON)
 *
 * 后端在 name/digest 字段里把匹配的关键字包成 `<mark>xxx</mark>`,
 * 前端用 sanitizeHighlight 安全渲染(只允许 mark 标签)。
 */

export interface SearchChannel {
  channel_id: string;
  channel_name: string;
  channel_type: number;
  channel_remark?: string;
  channel_avatar?: string;
}

export interface SearchFriend {
  channel_id: string;
  channel_name: string;
  channel_remark?: string;
  channel_avatar?: string;
  robot?: number;
  source_space_name?: string;
  home_space_name?: string;
}

export interface SearchGroup {
  channel_id: string;
  channel_name: string;
  channel_remark?: string;
  channel_avatar?: string;
  member_count?: number;
}

export interface SearchMessage {
  from_uid: string;
  from_name?: string;
  message_id?: string;
  message_seq?: number;
  timestamp?: number;
  payload?: Record<string, unknown> & { type?: number };
  /** 后端可能给的简略 digest(替 content_type 各类) */
  conversationDigest?: string;
  channel: SearchChannel;
}

export interface SearchGlobalResp {
  friends?: SearchFriend[];
  groups?: SearchGroup[];
  messages?: SearchMessage[];
}

export interface SearchGlobalParams {
  keyword: string;
  page?: number;
  limit?: number;
  /** 消息内容类型 filter,文件 tab 传 [MessageContentType.file];联系人/群 tab 传 [] */
  contentType?: number[];
  /** Channel 内搜索 */
  channelId?: string;
  channelType?: number;
  /** only_message=1 时不返 friends/groups,只返 messages */
  onlyMessage?: boolean;
}

export async function searchGlobal(params: SearchGlobalParams): Promise<SearchGlobalResp> {
  const spaceId = spaceStore.state.spaceId ?? undefined;
  const query = spaceId ? { space_id: spaceId } : undefined;
  const body: Record<string, unknown> = {
    keyword: params.keyword ?? "",
    page: params.page ?? 1,
    limit: params.limit ?? 20,
    content_type: params.contentType ?? [],
  };
  if (params.channelId) {
    body.channel_id = params.channelId;
    body.channel_type = params.channelType;
  }
  if (params.onlyMessage) {
    body.only_message = 1;
  }
  return api<SearchGlobalResp>("search/global", { method: "POST", query, body });
}

export type ChannelSearchTab = "all" | "message" | "media" | "file";

export type ChannelSearchItemKind = "text" | "image" | "video" | "file" | "merge_forward" | "quote";

export interface ChannelSearchSender {
  uid: string;
  name: string;
  avatarUrl?: string;
}

export interface ChannelSearchFilters {
  senderUids: string[];
  sort: "time_desc" | "time_asc";
  startAt?: number;
  endAt?: number;
}

export interface ChannelSearchQuery {
  channelId: string;
  channelType: number;
  keyword: string;
  tab: ChannelSearchTab;
  filters: ChannelSearchFilters;
  cursor?: string;
  limit: number;
}

export interface ChannelSearchFileInfo {
  name: string;
  size: number;
  extension?: string;
  url?: string;
  downloadUrl?: string;
  previewUrl?: string | null;
}

export interface ChannelSearchMediaInfo {
  url?: string;
  downloadUrl?: string;
  previewUrl?: string | null;
  thumbUrl?: string;
  duration?: number;
  width?: number;
  height?: number;
  monthBucket?: string;
}

export interface ChannelSearchForwardInnerMessage {
  messageId: string;
  type: number;
  text: string;
  senderUid?: string;
  senderName?: string;
  timestamp?: number;
}

export interface ChannelSearchForwardInfo {
  title: string;
  childCount?: number;
  innerMessages?: ChannelSearchForwardInnerMessage[];
}

export interface ChannelSearchRichTextMentionEntity {
  uid: string;
  offset: number;
  length: number;
}

export interface ChannelSearchRichTextMention {
  entities?: ChannelSearchRichTextMentionEntity[];
  all?: number;
  humans?: number;
  ais?: number;
}

export interface ChannelSearchRichTextInfo {
  content: RichTextBlock[];
  plain?: string;
  mention?: ChannelSearchRichTextMention;
}

export interface ChannelSearchItem {
  id: string;
  messageId: string;
  messageSeq: number;
  channelId?: string;
  channelType?: number;
  senderUid: string;
  sender?: ChannelSearchSender;
  timestamp: number;
  kind: ChannelSearchItemKind;
  text?: string;
  file?: ChannelSearchFileInfo;
  media?: ChannelSearchMediaInfo;
  forward?: ChannelSearchForwardInfo;
  richText?: ChannelSearchRichTextInfo;
}

export interface ChannelSearchResponse {
  items: ChannelSearchItem[];
  nextCursor?: string;
  hasMore: boolean;
}

export const CHANNEL_SEARCH_KEYWORD_MAX_RUNES = 64;

type SearchPagination = {
  has_more?: boolean;
  next_cursor?: string;
};

type SearchEnvelope<T> =
  | T[]
  | {
      data?: T[];
      pagination?: SearchPagination;
    };

type MessageSearchHit = {
  message_id?: string;
  message_seq?: number;
  message_kind?: "text" | "forward" | "quote" | "image" | "video";
  snippet?: string;
  sender_id?: string;
  sender_name?: string;
  sender_avatar_url?: string;
  sent_at?: string;
  outer_preview?: {
    title?: string;
    child_count?: number;
  };
  inner_messages?: ForwardInnerMessageHit[];
  channel_id?: string;
  channel_type?: number;
  thumb_url?: string;
  width?: number;
  height?: number;
  duration_ms?: number;
  rich_text?: RichTextSearchHit;
};

type ForwardInnerMessageHit = {
  message_id?: string;
  type?: number;
  search_text?: string;
  sender_id?: string;
  sender_name?: string;
  sent_at?: string;
};

type RichTextSearchBlock = {
  type?: string;
  text?: string;
  url?: string;
  width?: number;
  height?: number;
  size?: number;
  name?: string;
  extension?: string;
  mime?: string;
  caption?: string;
};

type RichTextSearchMentionEntity = {
  uid?: string;
  offset?: number;
  length?: number;
};

type RichTextSearchHit = {
  content?: RichTextSearchBlock[];
  plain?: string;
  mention?: {
    entities?: RichTextSearchMentionEntity[];
    all?: number;
    humans?: number;
    ais?: number;
  };
};

type MediaSearchHit = {
  message_id?: string;
  message_seq?: number;
  media_kind?: "image" | "video";
  url?: string;
  media_url?: string;
  file_url?: string;
  image_url?: string;
  video_url?: string;
  download_url?: string;
  preview_url?: string | null;
  thumb_url?: string;
  duration_ms?: number;
  width?: number;
  height?: number;
  sender_id?: string;
  sender_name?: string;
  sender_avatar_url?: string;
  sent_at?: string;
  month_bucket?: string;
  channel_id?: string;
  channel_type?: number;
};

type FileSearchHit = {
  message_id?: string;
  message_seq?: number;
  file_name?: string;
  file_size_bytes?: number;
  file_ext?: string;
  download_url?: string;
  preview_url?: string | null;
  sender_id?: string;
  sender_name?: string;
  sender_avatar_url?: string;
  sent_at?: string;
  channel_id?: string;
  channel_type?: number;
};

type CombinedSearchHit = {
  result_type?: "message" | "file" | "media";
  sorted_at?: string;
  message?: MessageSearchHit;
  file?: FileSearchHit;
  media?: MediaSearchHit;
};

export function defaultChannelSearchFilters(): ChannelSearchFilters {
  return { senderUids: [], sort: "time_desc" };
}

export function countChannelSearchKeywordRunes(keyword: string): number {
  return Array.from(keyword).length;
}

export function truncateChannelSearchKeyword(keyword: string): string {
  return Array.from(keyword).slice(0, CHANNEL_SEARCH_KEYWORD_MAX_RUNES).join("");
}

function channelSearchEndpoint(tab: ChannelSearchTab): string {
  if (tab === "all") return "messages/_search_all";
  if (tab === "message") return "messages/_search";
  if (tab === "media") return "messages/_search_media";
  return "messages/_search_files";
}

function normalizeItems<T>(resp: SearchEnvelope<T> | undefined): {
  items: T[];
  pagination?: SearchPagination;
} {
  if (Array.isArray(resp)) return { items: resp };
  return {
    items: Array.isArray(resp?.data) ? resp.data : [],
    pagination: resp?.pagination,
  };
}

function cleanChannelSearchFilters(filters: ChannelSearchFilters): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  if (filters.senderUids.length > 0) next.sender_ids = filters.senderUids.slice(0, 50);
  const from = secondsToDateOnly(filters.startAt);
  const to = secondsToDateOnly(filters.endAt);
  if (from) next.sent_at_from = from;
  if (to) next.sent_at_to = to;
  return next;
}

function hasEffectiveChannelSearchFilters(filters: ChannelSearchFilters): boolean {
  return Object.keys(cleanChannelSearchFilters(filters)).length > 0;
}

export function shouldRunChannelSearch(
  query: Pick<ChannelSearchQuery, "keyword" | "filters" | "tab">,
): boolean {
  if (query.tab !== "all" && query.tab !== "message") return true;
  return query.keyword.trim().length > 0 || hasEffectiveChannelSearchFilters(query.filters);
}

function toChannelSearchBody(query: ChannelSearchQuery): Record<string, unknown> {
  const body: Record<string, unknown> = {
    channel_type: query.channelType,
    channel_id: query.channelId,
    filters: cleanChannelSearchFilters(query.filters),
    sort: query.filters.sort,
    page_size: query.limit,
    cursor: query.cursor || "",
  };
  const keyword = truncateChannelSearchKeyword(query.keyword.trim());
  if (query.tab === "all" || query.tab === "message") {
    body.keyword = keyword;
  } else if (query.tab === "file" && keyword) {
    body.keyword = keyword;
  }
  return body;
}

function sentAtToSeconds(value?: string): number {
  if (!value) return Math.floor(Date.now() / 1000);
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? Math.floor(Date.now() / 1000) : Math.floor(time / 1000);
}

function optionalSentAtToSeconds(value?: string): number | undefined {
  if (!value) return undefined;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? undefined : Math.floor(time / 1000);
}

function secondsToDateOnly(seconds?: number): string | undefined {
  if (!seconds) return undefined;
  const date = new Date(seconds * 1000);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthBucketFromSentAt(sentAt?: string): string {
  const date = sentAt ? new Date(sentAt) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}`;
}

function resolveRemoteUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  if (/^(https?:|data:|blob:)/i.test(path)) return path;
  const base = endpointStore.state.baseURL;
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function senderFromHit(hit: {
  sender_id?: string;
  sender_name?: string;
  sender_avatar_url?: string;
}): ChannelSearchSender {
  const uid = hit.sender_id || "";
  return {
    uid,
    name: hit.sender_name || uid,
    avatarUrl: resolveRemoteUrl(hit.sender_avatar_url),
  };
}

function channelFromHit(
  hit: { channel_id?: string; channel_type?: number },
  query: ChannelSearchQuery,
): { channelId: string; channelType: number } {
  return {
    channelId: hit.channel_id || query.channelId,
    channelType: typeof hit.channel_type === "number" ? hit.channel_type : query.channelType,
  };
}

function mapForwardInnerMessage(hit: ForwardInnerMessageHit): ChannelSearchForwardInnerMessage {
  return {
    messageId: hit.message_id || "",
    type: typeof hit.type === "number" ? hit.type : 0,
    text: hit.search_text || "",
    senderUid: hit.sender_id || undefined,
    senderName: hit.sender_name || undefined,
    timestamp: optionalSentAtToSeconds(hit.sent_at),
  };
}

function normalizeRichTextMention(
  mention?: RichTextSearchHit["mention"],
): ChannelSearchRichTextMention | undefined {
  if (!mention) return undefined;
  const entities = Array.isArray(mention.entities)
    ? mention.entities
        .filter(
          (
            entity,
          ): entity is {
            uid: string;
            offset: number;
            length: number;
          } =>
            typeof entity?.uid === "string" &&
            typeof entity.offset === "number" &&
            typeof entity.length === "number" &&
            entity.offset >= 0 &&
            entity.length > 0,
        )
        .map((entity) => ({
          uid: entity.uid,
          offset: entity.offset,
          length: entity.length,
        }))
    : undefined;
  return {
    entities,
    all: mention.all,
    humans: mention.humans,
    ais: mention.ais,
  };
}

function normalizeRichText(richText?: RichTextSearchHit): ChannelSearchRichTextInfo | undefined {
  if (!richText) return undefined;
  const content: RichTextBlock[] = Array.isArray(richText.content)
    ? richText.content
        .filter((block): block is RichTextSearchBlock & { type: string } => {
          return typeof block?.type === "string" && block.type.length > 0;
        })
        .map((block) => ({
          type: block.type,
          text: block.text,
          url: resolveRemoteUrl(block.url),
          width: block.width,
          height: block.height,
          size: block.size,
          name: block.name,
        }))
    : [];
  const plain = typeof richText.plain === "string" ? richText.plain : undefined;
  if (content.length === 0 && !plain) return undefined;
  return {
    content,
    plain,
    mention: normalizeRichTextMention(richText.mention),
  };
}

function mapMessageMediaHit(
  hit: MessageSearchHit,
  query: ChannelSearchQuery,
  mediaKind: "image" | "video",
): ChannelSearchItem {
  const sender = senderFromHit(hit);
  const hitChannel = channelFromHit(hit, query);
  const thumbUrl = resolveRemoteUrl(hit.thumb_url);
  return {
    id: hit.message_id || `${hit.message_seq || 0}`,
    messageId: hit.message_id || "",
    messageSeq: hit.message_seq || 0,
    channelId: hitChannel.channelId,
    channelType: hitChannel.channelType,
    senderUid: sender.uid,
    sender,
    timestamp: sentAtToSeconds(hit.sent_at),
    kind: mediaKind,
    text: hit.snippet || "",
    media: {
      url: mediaKind === "image" ? thumbUrl : undefined,
      previewUrl: mediaKind === "image" ? thumbUrl : undefined,
      thumbUrl,
      duration:
        typeof hit.duration_ms === "number" ? Math.round(hit.duration_ms / 1000) : undefined,
      width: hit.width,
      height: hit.height,
      monthBucket: monthBucketFromSentAt(hit.sent_at),
    },
  };
}

function mapMessageHit(hit: MessageSearchHit, query: ChannelSearchQuery): ChannelSearchItem {
  const sender = senderFromHit(hit);
  const hitChannel = channelFromHit(hit, query);
  const messageKind = hit.message_kind || "text";
  if (messageKind === "image" || messageKind === "video") {
    return mapMessageMediaHit(hit, query, messageKind);
  }
  const richText = normalizeRichText(hit.rich_text);
  const kind =
    messageKind === "forward" ? "merge_forward" : messageKind === "quote" ? "quote" : "text";
  const richTextPlain = richText
    ? richText.plain || buildRichTextPlain(richText.content)
    : undefined;
  return {
    id: hit.message_id || `${hit.message_seq || 0}`,
    messageId: hit.message_id || "",
    messageSeq: hit.message_seq || 0,
    channelId: hitChannel.channelId,
    channelType: hitChannel.channelType,
    senderUid: sender.uid,
    sender,
    timestamp: sentAtToSeconds(hit.sent_at),
    kind,
    text: hit.snippet || richTextPlain || "",
    richText,
    forward:
      messageKind === "forward"
        ? {
            title: hit.outer_preview?.title || "",
            childCount: hit.outer_preview?.child_count,
            innerMessages: Array.isArray(hit.inner_messages)
              ? hit.inner_messages.map(mapForwardInnerMessage)
              : undefined,
          }
        : undefined,
  };
}

function mapFileHit(hit: FileSearchHit, query: ChannelSearchQuery): ChannelSearchItem {
  const sender = senderFromHit(hit);
  const hitChannel = channelFromHit(hit, query);
  const file: ChannelSearchFileInfo = {
    name: hit.file_name || "",
    size: hit.file_size_bytes || 0,
    extension: hit.file_ext,
    url: resolveRemoteUrl(hit.preview_url || hit.download_url),
    downloadUrl: resolveRemoteUrl(hit.download_url),
    previewUrl: resolveRemoteUrl(hit.preview_url),
  };
  return {
    id: hit.message_id || `${hit.message_seq || 0}`,
    messageId: hit.message_id || "",
    messageSeq: hit.message_seq || 0,
    channelId: hitChannel.channelId,
    channelType: hitChannel.channelType,
    senderUid: sender.uid,
    sender,
    timestamp: sentAtToSeconds(hit.sent_at),
    kind: "file",
    file,
  };
}

function mapMediaHit(hit: MediaSearchHit, query: ChannelSearchQuery): ChannelSearchItem {
  const sender = senderFromHit(hit);
  const hitChannel = channelFromHit(hit, query);
  const mediaKind = hit.media_kind || "image";
  const previewUrl = resolveRemoteUrl(hit.preview_url);
  const downloadUrl = resolveRemoteUrl(hit.download_url);
  const mediaUrl =
    previewUrl ||
    resolveRemoteUrl(hit.media_url || hit.url || hit.file_url || hit.image_url || hit.video_url) ||
    downloadUrl;
  return {
    id: hit.message_id || `${hit.message_seq || 0}`,
    messageId: hit.message_id || "",
    messageSeq: hit.message_seq || 0,
    channelId: hitChannel.channelId,
    channelType: hitChannel.channelType,
    senderUid: sender.uid,
    sender,
    timestamp: sentAtToSeconds(hit.sent_at),
    kind: mediaKind === "video" ? "video" : "image",
    media: {
      url: mediaUrl,
      previewUrl,
      downloadUrl,
      thumbUrl: resolveRemoteUrl(hit.thumb_url),
      duration:
        typeof hit.duration_ms === "number" ? Math.round(hit.duration_ms / 1000) : undefined,
      width: hit.width,
      height: hit.height,
      monthBucket: hit.month_bucket || monthBucketFromSentAt(hit.sent_at),
    },
  };
}

function mapCombinedHit(
  hit: CombinedSearchHit,
  query: ChannelSearchQuery,
): ChannelSearchItem | undefined {
  let item: ChannelSearchItem | undefined;
  if (hit.result_type === "file" && hit.file) item = mapFileHit(hit.file, query);
  else if (hit.result_type === "message" && hit.message) item = mapMessageHit(hit.message, query);
  else if (hit.result_type === "media" && hit.media) item = mapMediaHit(hit.media, query);
  if (item && hit.sorted_at) item.timestamp = sentAtToSeconds(hit.sorted_at);
  return item;
}

export const channelSearchApiTestUtils = {
  RichTextBlockType,
  mapMessageHit,
  mapCombinedHit,
  normalizeRichText,
  mapMessageMediaHit,
};

export async function searchChannelMessages(
  query: ChannelSearchQuery,
): Promise<ChannelSearchResponse> {
  const resp = await api<
    SearchEnvelope<CombinedSearchHit | MessageSearchHit | MediaSearchHit | FileSearchHit>
  >(channelSearchEndpoint(query.tab), { method: "POST", body: toChannelSearchBody(query) });

  let items: ChannelSearchItem[];
  let pagination: SearchPagination | undefined;
  if (query.tab === "all") {
    const normalized = normalizeItems<CombinedSearchHit>(resp as SearchEnvelope<CombinedSearchHit>);
    pagination = normalized.pagination;
    items = normalized.items
      .map((hit) => mapCombinedHit(hit, query))
      .filter((item): item is ChannelSearchItem => !!item);
  } else if (query.tab === "media") {
    const normalized = normalizeItems<MediaSearchHit>(resp as SearchEnvelope<MediaSearchHit>);
    pagination = normalized.pagination;
    items = normalized.items.map((hit) => mapMediaHit(hit, query));
  } else if (query.tab === "file") {
    const normalized = normalizeItems<FileSearchHit>(resp as SearchEnvelope<FileSearchHit>);
    pagination = normalized.pagination;
    items = normalized.items.map((hit) => mapFileHit(hit, query));
  } else {
    const normalized = normalizeItems<MessageSearchHit>(resp as SearchEnvelope<MessageSearchHit>);
    pagination = normalized.pagination;
    items = normalized.items.map((hit) => mapMessageHit(hit, query));
  }

  return {
    items,
    nextCursor: pagination?.next_cursor || undefined,
    hasMore: !!pagination?.has_more,
  };
}
