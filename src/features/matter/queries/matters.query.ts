import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { getMatter, listMatters } from "@/features/matter/api/matter.api";
import type { MatterListParams, PaginatedList, Matter } from "@/features/matter/types/matter.types";

/**
 * Matter 列表 infinite query。游标分页(后端 keyset)。
 *
 * key 形态:["matter", "list", "infinite", spaceId, params],含 spaceId 防止跨
 * Space 缓存串。staleTime 30s — matter 状态变更频繁,既让缓存避免重复请求,
 * 又让 mutation invalidate 能主动失效。
 *
 * 兼容旧调用点(MatterView 用 useQuery 直接拉非分页):保留 `mattersQueryOptions`,
 * Commit 8 路由整合时切到 infinite,届时旧 query 可删。
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
