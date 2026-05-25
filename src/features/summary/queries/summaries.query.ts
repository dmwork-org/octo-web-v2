import { queryOptions } from "@tanstack/react-query";
import {
  getMembers,
  getPersonalResult,
  getSummaryDetail,
  listSchedules,
  listSummaries,
} from "@/features/summary/api/summary.api";
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

/**
 * Schedule 列表 query(Wave 3b)。
 * 后端 GET /summary-schedules 不分页,直接拉全。
 */

export const schedulesQueryKey = ["summary", "schedules"] as const;

export const schedulesQueryOptions = () =>
  queryOptions({
    queryKey: schedulesQueryKey,
    queryFn: () => listSchedules(),
    staleTime: 30 * 1000,
  });

/**
 * 个人模式当前用户结果(Wave 3c)。enabled by taskId + isPersonalMode。
 * 短 staleTime + active 状态轮询(让"等待提交"的 UI 自动反映服务端 status)。
 */

export const personalResultQueryKey = (taskId: number) => ["summary", "personal", taskId] as const;

export const personalResultQueryOptions = (taskId: number | null, enabled: boolean) =>
  queryOptions({
    queryKey: personalResultQueryKey(taskId ?? -1),
    queryFn: () => getPersonalResult(taskId!),
    enabled: enabled && taskId !== null,
    staleTime: 15 * 1000,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      // worker_status: 0 待提交 / 1 已提交 / 2 处理中 / 3 完成
      return data.worker_status === 0 || data.worker_status === 2 ? POLL_INTERVAL : false;
    },
  });

/**
 * 个人模式所有成员状态(Wave 3c,创建人视角看 participants 进度)。
 */

export const membersQueryKey = (taskId: number) => ["summary", "members", taskId] as const;

export const membersQueryOptions = (taskId: number | null, enabled: boolean) =>
  queryOptions({
    queryKey: membersQueryKey(taskId ?? -1),
    queryFn: () => getMembers(taskId!),
    enabled: enabled && taskId !== null,
    staleTime: 15 * 1000,
  });
