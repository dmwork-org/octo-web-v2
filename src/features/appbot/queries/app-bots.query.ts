import { queryOptions } from "@tanstack/react-query";
import { getAvailableBots } from "@/features/appbot/api/app-bot.api";

/**
 * App Bot 列表(按 Space 维度,平台 bot 不依赖 Space 但后端按当前 Space 上下文返回)。
 * 列表需跟随后端可见性变化,覆盖项目全局 60s fresh 缓存:
 * 已有缓存先显示,进入页面 / 窗口聚焦 / 网络恢复时后台刷新。
 */

export const appBotsQueryKey = (spaceId: string | null) =>
  ["appbot", "available", spaceId ?? "_"] as const;

export const appBotsQueryOptions = (spaceId: string | null) =>
  queryOptions({
    queryKey: appBotsQueryKey(spaceId),
    queryFn: () => getAvailableBots(spaceId ?? undefined),
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
