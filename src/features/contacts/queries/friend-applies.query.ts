import { queryOptions } from "@tanstack/react-query";
import { getFriendApplies } from "@/features/contacts/api/friend-applies.api";

/**
 * 新好友申请列表 query。
 * P3-D2 第一版:进入 tab 时拉一次;P3 加 IM CMD `friendRequest` listener 触发 invalidate。
 */
export const friendAppliesQueryKey = ["contacts", "friendApplies"] as const;

export const friendAppliesQueryOptions = () =>
  queryOptions({
    queryKey: friendAppliesQueryKey,
    queryFn: () => getFriendApplies(),
    staleTime: 60 * 1000,
  });
