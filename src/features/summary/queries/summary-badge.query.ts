import { queryOptions } from "@tanstack/react-query";
import { listSummaries } from "@/features/summary/api/summary.api";
import { TaskStatus } from "@/features/summary/types/summary.types";

/**
 * NavRail summary 图标 badge:WAITING_CONFIRM(等待用户确认)的任务数。
 *
 * 设计要点:
 * - **独立查询**(page_size=1 只为拿 `total`),不复用列表查询 — 列表会被
 *   用户筛选 / 排序影响,但 badge 必须看"全量 WAITING_CONFIRM"才正确。
 * - sidebar 内 NavItem 持续订阅;手动入口(创建成功 / 详情 accept / decline)
 *   后调 `queryClient.invalidateQueries({ queryKey: summaryBadgeQueryKey })`。
 * - 60s 自动 refetch 兜底(对齐老仓 emitBadgeUpdate 频率,既不过载也保证迟早能看到)。
 * - `enabled` 由 caller 控制:登录前 / 无 spaceId 时关掉。
 */

export const summaryBadgeQueryKey = ["summary", "badge"] as const;

export const summaryBadgeQueryOptions = (enabled: boolean) =>
  queryOptions({
    queryKey: summaryBadgeQueryKey,
    queryFn: async () => {
      const res = await listSummaries({
        status: TaskStatus.WAITING_CONFIRM,
        page: 1,
        page_size: 1,
      });
      return res.total;
    },
    enabled,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });
