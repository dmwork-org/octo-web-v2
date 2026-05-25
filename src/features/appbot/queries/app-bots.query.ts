import { queryOptions } from "@tanstack/react-query";
import { getAvailableBots } from "@/features/appbot/api/app-bot.api";

/**
 * App Bot 列表(按 Space 维度,平台 bot 不依赖 Space 但后端按当前 Space 上下文返回)。
 * staleTime 5 分钟 — bot 列表变化不频繁;Space 切换由 main.tsx 的 clear 失效。
 */

export const appBotsQueryKey = (spaceId: string | null) =>
  ["appbot", "available", spaceId ?? "_"] as const;

export const appBotsQueryOptions = (spaceId: string | null) =>
  queryOptions({
    queryKey: appBotsQueryKey(spaceId),
    queryFn: () => getAvailableBots(spaceId ?? undefined),
    staleTime: 5 * 60 * 1000,
  });
