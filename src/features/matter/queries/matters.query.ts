import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import {
  getMatter,
  listActivities,
  listMatters,
  listOutputs,
  listTimeline,
} from "@/features/matter/api/matter.api";
import { getMyGroups } from "@/features/base/api/endpoints/group.api";
import { getMessages } from "@/features/matter/api/message-bridge.api";
import type {
  ActivityEntry,
  Matter,
  MatterListParams,
  PaginatedList,
  TimelineEntry,
} from "@/features/matter/types/matter.types";

/**
 * Matter 列表 infinite query。游标分页(后端 keyset)。
 *
 * key 形态:["matter", "list", "infinite", spaceId, params],含 spaceId 防止跨
 * Space 缓存串。staleTime 30s — matter 状态变更频繁,既让缓存避免重复请求,
 * 又让 mutation invalidate 能主动失效。
 */

export const mattersListInfiniteQueryKey = (
  spaceId: string | null,
  params: MatterListParams | undefined,
) => ["matter", "list", "infinite", spaceId ?? "_", params ?? null] as const;

export const mattersListInfiniteQueryOptions = (
  spaceId: string | null,
  params?: MatterListParams,
) =>
  infiniteQueryOptions({
    queryKey: mattersListInfiniteQueryKey(spaceId, params),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }): Promise<PaginatedList<Matter>> =>
      listMatters({ ...params, cursor: pageParam }),
    getNextPageParam: (lastPage) =>
      lastPage.pagination.has_more ? lastPage.pagination.next_cursor : undefined,
    enabled: !!spaceId,
    staleTime: 30 * 1000,
  });

/** 旧非分页 list query — Commit 8 切换 infinite 后会被 MatterView 弃用,届时删除。 */
export const mattersQueryKey = (params: MatterListParams | undefined) =>
  ["matter", "list", params ?? null] as const;

export const mattersQueryOptions = (params?: MatterListParams) =>
  queryOptions({
    queryKey: mattersQueryKey(params),
    queryFn: () => listMatters(params),
    staleTime: 30 * 1000,
  });

/**
 * Matter 详情 query。enabled by matterId 控制(null 不发请求)。
 * source_channel_id 可选,影响后端可见性查询。
 */

export const matterDetailQueryKey = (matterId: string) => ["matter", "detail", matterId] as const;

export const matterDetailQueryOptions = (matterId: string | null, sourceChannelId?: string) =>
  queryOptions({
    queryKey: matterDetailQueryKey(matterId ?? "_"),
    queryFn: () => getMatter(matterId!, sourceChannelId),
    enabled: !!matterId,
    staleTime: 30 * 1000,
  });

/**
 * Matter timeline(评论)infinite query。本期 channel-picker 仍 P3+,因此不传
 * source_channel_id,后端返回整个 matter 全量 timeline(平铺)。P3+ 接 channel-
 * picker 后改为 source_channel_id 分组渲染。
 */

const TIMELINE_PAGE_LIMIT = 30;

export const timelineInfiniteQueryKey = (matterId: string) =>
  ["matter", "timeline", matterId] as const;

export const timelineInfiniteQueryOptions = (matterId: string) =>
  infiniteQueryOptions({
    queryKey: timelineInfiniteQueryKey(matterId),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }): Promise<PaginatedList<TimelineEntry>> =>
      listTimeline(matterId, { limit: TIMELINE_PAGE_LIMIT, cursor: pageParam }),
    getNextPageParam: (lastPage) =>
      lastPage.pagination.has_more ? lastPage.pagination.next_cursor : undefined,
    staleTime: 15 * 1000,
  });

/**
 * Matter activities(变更记录)infinite query。只读,展示状态变更 / 受理人变更
 * / DDL 变更等 activity 时间线。
 */

export const activitiesInfiniteQueryKey = (matterId: string) =>
  ["matter", "activities", matterId] as const;

export const activitiesInfiniteQueryOptions = (matterId: string) =>
  infiniteQueryOptions({
    queryKey: activitiesInfiniteQueryKey(matterId),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }): Promise<PaginatedList<ActivityEntry>> =>
      listActivities(matterId, { limit: TIMELINE_PAGE_LIMIT, cursor: pageParam }),
    getNextPageParam: (lastPage) =>
      lastPage.pagination.has_more ? lastPage.pagination.next_cursor : undefined,
    staleTime: 30 * 1000,
  });

/**
 * 我的群列表 query。modal 打开时按需拉取(enabled: open)。
 * staleTime 5min — 群列表不常变。
 */
export const myGroupsQueryKey = (spaceId: string | null) =>
  ["groups", "my", spaceId ?? "_"] as const;

export const myGroupsQueryOptions = (spaceId: string | null, enabled: boolean) =>
  queryOptions({
    queryKey: myGroupsQueryKey(spaceId),
    queryFn: () => getMyGroups(spaceId!),
    enabled: enabled && !!spaceId,
    staleTime: 5 * 60 * 1000,
  });

// ─── 关联群聊逐群 timeline ──────────────────────────────────

/** 某群的最新 1 条 timeline 摘要（折叠态展示用）。 */
export const channelLatestTimelineQueryKey = (matterId: string, channelId: string) =>
  ["matter", "channel-latest-timeline", matterId, channelId] as const;

export const channelLatestTimelineQueryOptions = (matterId: string, channelId: string) =>
  queryOptions({
    queryKey: channelLatestTimelineQueryKey(matterId, channelId),
    queryFn: () => listTimeline(matterId, { source_channel_id: channelId, limit: 1 }),
    staleTime: 30 * 1000,
  });

/** 展开某群时拉取完整 timeline。enabled 控制按需加载。 */
export const channelTimelineQueryKey = (matterId: string, channelId: string) =>
  ["matter", "channel-timeline", matterId, channelId] as const;

export const channelTimelineQueryOptions = (
  matterId: string,
  channelId: string,
  enabled: boolean,
) =>
  queryOptions({
    queryKey: channelTimelineQueryKey(matterId, channelId),
    queryFn: () => listTimeline(matterId, { source_channel_id: channelId }),
    enabled,
    staleTime: 15 * 1000,
  });

// ─── 原消息上下文 ────────────────────────────────────────────

export const anchorMessagesQueryKey = (
  channelId: string,
  channelType: number,
  messageIds: string[],
) => ["matter", "anchor-messages", channelId, channelType, ...messageIds] as const;

export const anchorMessagesQueryOptions = (
  channelId: string,
  channelType: number,
  messageIds: string[],
  enabled: boolean,
) =>
  queryOptions({
    queryKey: anchorMessagesQueryKey(channelId, channelType, messageIds),
    queryFn: () => getMessages(channelId, channelType, messageIds),
    enabled: enabled && messageIds.length > 0,
    staleTime: 10 * 60 * 1000,
  });

// ─── Outputs (产出文件) ─────────────────────────────────

const OUTPUTS_PAGE_LIMIT = 50;

export const matterOutputsQueryKey = (matterId: string, q: string) =>
  ["matter", "outputs", matterId, q] as const;

export const matterOutputsQueryOptions = (matterId: string, q: string) =>
  queryOptions({
    queryKey: matterOutputsQueryKey(matterId, q),
    queryFn: () => listOutputs(matterId, { limit: OUTPUTS_PAGE_LIMIT, q: q || undefined }),
    staleTime: 30 * 1000,
  });
