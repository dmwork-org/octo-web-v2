import { queryOptions } from "@tanstack/react-query";
import { getMySpaces, type SpaceResp } from "@/features/base/api/endpoints/space.api";

/**
 * 我的空间列表 query。
 * P3-C24 接 Space 全套(创建/加入/管理/邀请)前,仅做"读 + 选当前"。
 *
 * staleTime 5 分钟:空间列表低频变更,无需每次 mount 重拉。
 */
export const mySpacesQueryKey = ["base", "spaces", "my"] as const;

export const mySpacesQueryOptions = () =>
  queryOptions({
    queryKey: mySpacesQueryKey,
    queryFn: async (): Promise<SpaceResp[]> => getMySpaces(),
    staleTime: 5 * 60 * 1000,
  });
