import { queryOptions } from "@tanstack/react-query";
import { syncFriends, type SyncFriendsParams } from "@/features/contacts/api/friends.api";

/**
 * 好友列表 query。
 * P3-D1 第一版:全量 sync(version=0);P3-D2 加增量(根据 last version)。
 *
 * staleTime 30 分钟 — 列表不频繁变化,IM CMD friendAccept/friendDeleted 触发 invalidate。
 */
export const friendsQueryKey = ["contacts", "friends"] as const;

export const friendsQueryOptions = (params?: SyncFriendsParams) =>
  queryOptions({
    queryKey: [...friendsQueryKey, params ?? null] as const,
    queryFn: () => syncFriends(params),
    staleTime: 30 * 60 * 1000,
  });
