import { queryOptions } from "@tanstack/react-query";
import { getSummaryDetail, listSummaries } from "@/features/summary/api/summary.api";
import {
  TaskStatus,
  type ListSummariesParams,
  type SummaryDetail,
} from "@/features/summary/types/summary.types";

const POLL_INTERVAL = 5 * 1000;

/** 状态在 PENDING / WAITING_CONFIRM / PROCESSING 时才需要轮询。 */
function shouldPoll(status: number): boolean {
  return (
    status === TaskStatus.PENDING ||
    status === TaskStatus.WAITING_CONFIRM ||
    status === TaskStatus.PROCESSING
  );
}

/**
 * 总结列表 query。staleTime 30s。
 *
 * **轮询**:任意一条 item 处于 PENDING/WAITING_CONFIRM/PROCESSING 就 5s 轮询一次,
 * 全部 settled(COMPLETED/FAILED/CANCELLED) 后停。这是 react-query 的 refetchInterval
 * 函数式写法,query 自带的 polling 不需要手动 setInterval。
 */
export const summariesQueryKey = (params: ListSummariesParams | undefined) =>
  ["summary", "list", params ?? null] as const;

export const summariesQueryOptions = (params?: ListSummariesParams) =>
  queryOptions({
    queryKey: summariesQueryKey(params),
    queryFn: () => listSummaries(params ?? {}),
    staleTime: 30 * 1000,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      const anyActive = data.items.some((it) => shouldPoll(it.status));
      return anyActive ? POLL_INTERVAL : false;
    },
  });

/**
 * 详情 query。enabled by taskId。
 * **轮询**:status 处于 active 三态时 5s 轮询(同列表逻辑)。
 */
export const summaryDetailQueryKey = (taskId: number) => ["summary", "detail", taskId] as const;

export const summaryDetailQueryOptions = (taskId: number | null) =>
  queryOptions({
    queryKey: summaryDetailQueryKey(taskId ?? -1),
    queryFn: () => getSummaryDetail(taskId!),
    enabled: taskId !== null,
    staleTime: 30 * 1000,
    refetchInterval: (query) => {
      const data = query.state.data as SummaryDetail | undefined;
      if (!data) return false;
      return shouldPoll(data.status) ? POLL_INTERVAL : false;
    },
  });
