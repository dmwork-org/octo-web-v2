import { queryOptions } from "@tanstack/react-query";
import { getSummaryDetail, listSummaries } from "@/features/summary/api/summary.api";
import type { ListSummariesParams } from "@/features/summary/types/summary.types";

/**
 * 总结列表 query。staleTime 30s — 任务状态变化频繁(PROCESSING → COMPLETED),
 * 列表轮询交由 Wave 2 加 refetchInterval;Wave 1 进入页面拉一次。
 */

export const summariesQueryKey = (params: ListSummariesParams | undefined) =>
  ["summary", "list", params ?? null] as const;

export const summariesQueryOptions = (params?: ListSummariesParams) =>
  queryOptions({
    queryKey: summariesQueryKey(params),
    queryFn: () => listSummaries(params ?? {}),
    staleTime: 30 * 1000,
  });

/** 详情 query。enabled by taskId。 */

export const summaryDetailQueryKey = (taskId: number) => ["summary", "detail", taskId] as const;

export const summaryDetailQueryOptions = (taskId: number | null) =>
  queryOptions({
    queryKey: summaryDetailQueryKey(taskId ?? -1),
    queryFn: () => getSummaryDetail(taskId!),
    enabled: taskId !== null,
    staleTime: 30 * 1000,
  });
