import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import {
  getMatter,
  listActivities,
  listMatters,
  listTimeline,
} from "@/features/matter/api/matter.api";
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
