import { queryOptions } from "@tanstack/react-query";
import { getUserDetail } from "@/features/base/api/endpoints/user.api";

/**
 * 用户详情 query。enabled by uid。
 * staleTime 2 分钟 — 备注 / 好友状态可能在弹窗期间被改;不长缓存。
 */

export const userDetailQueryKey = (uid: string, groupNo?: string) =>
  ["user", "detail", uid, groupNo ?? ""] as const;

export const userDetailQueryOptions = (uid: string | null, groupNo?: string) =>
  queryOptions({
    queryKey: userDetailQueryKey(uid ?? "_", groupNo),
    queryFn: () => getUserDetail(uid!, groupNo),
    enabled: !!uid,
    staleTime: 2 * 60 * 1000,
  });
