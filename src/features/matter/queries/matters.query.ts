import { queryOptions } from "@tanstack/react-query";
import { getMatter, listMatters, listTimeline } from "@/features/matter/api/matter.api";
import type { MatterListParams } from "@/features/matter/types/matter.types";

/**
 * Matter 列表 query。
 *
 * staleTime 30s — matter 状态变更频繁,既要让 React Query 缓存避免重复请求,
 * 又要让 tab 切换 / 创建后 invalidate 主动失效。Mutation 后调用方手动 invalidate。
 */

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
 * Matter Timeline query。enabled by matterId(K-3 评论/时间线)。
 * 不带 cursor 拿首页 limit=50;后续 wave 接 useInfiniteQuery。
 */

export const timelineQueryKey = (matterId: string) => ["matter", "timeline", matterId] as const;

export const timelineQueryOptions = (matterId: string | null) =>
  queryOptions({
    queryKey: timelineQueryKey(matterId ?? "_"),
    queryFn: () => listTimeline(matterId!, { limit: 50 }),
    enabled: !!matterId,
    staleTime: 15 * 1000,
  });
