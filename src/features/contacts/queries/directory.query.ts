import { queryOptions } from "@tanstack/react-query";
import { getSpaceMembers } from "@/features/base/api/endpoints/space.api";
import { getMyBots, getSpaceBots } from "@/features/base/api/endpoints/robot.api";
import { getMyGroups } from "@/features/base/api/endpoints/group.api";

/**
 * 通讯录目录 4 个数据源(全部按当前 Space 维度):
 * - spaceMembers — Space 内所有成员(人 + AI),展开"全部联系人"主列表
 * - myBots       — 我已添加的 AI,渲染"已添加 AI"段
 * - spaceBots    — Space 内可见的所有 AI(含未添加),用于补全"全部"模式 + filter "AI"
 * - myGroups     — 我加入的群,渲染"群聊"段
 *
 * staleTime 5 分钟;Space 切换由 spaceStore.subscribe → queryClient.clear 自然失效。
 */

const COMMON_STALE = 5 * 60 * 1000;

export const spaceMembersQueryKey = (spaceId: string) =>
  ["contacts", "space-members", spaceId] as const;

export const spaceMembersQueryOptions = (spaceId: string | null) =>
  queryOptions({
    queryKey: spaceMembersQueryKey(spaceId ?? "_"),
    queryFn: () => getSpaceMembers(spaceId!),
    enabled: !!spaceId,
    staleTime: COMMON_STALE,
  });

export const myBotsQueryKey = (spaceId: string) => ["contacts", "my-bots", spaceId] as const;

export const myBotsQueryOptions = (spaceId: string | null) =>
  queryOptions({
    queryKey: myBotsQueryKey(spaceId ?? "_"),
    queryFn: () => getMyBots(spaceId!),
    enabled: !!spaceId,
    staleTime: COMMON_STALE,
  });

export const spaceBotsQueryKey = (spaceId: string) => ["contacts", "space-bots", spaceId] as const;

export const spaceBotsQueryOptions = (spaceId: string | null) =>
  queryOptions({
    queryKey: spaceBotsQueryKey(spaceId ?? "_"),
    queryFn: () => getSpaceBots(spaceId!),
    enabled: !!spaceId,
    staleTime: COMMON_STALE,
  });

export const myGroupsQueryKey = (spaceId: string) => ["contacts", "my-groups", spaceId] as const;

export const myGroupsQueryOptions = (spaceId: string | null) =>
  queryOptions({
    queryKey: myGroupsQueryKey(spaceId ?? "_"),
    queryFn: () => getMyGroups(spaceId!),
    enabled: !!spaceId,
    staleTime: COMMON_STALE,
  });
