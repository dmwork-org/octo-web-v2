import { queryOptions } from "@tanstack/react-query";
import { listCategories, type CategoryItem } from "@/features/base/api/endpoints/follow.api";

/**
 * 关注分组列表 query(对应旧 dmworkbase ConversationListWithCategory 的数据源)。
 *
 * key 进 spaceId — Space 切换时 react-query 自动当新 query;旧 spaceId 的 cache
 * 由 main.tsx 的 spaceStore.subscribe → queryClient.clear() 兜底清掉。
 *
 * staleTime 60s — 关注/取关后由 mutation onSuccess 触发 invalidate,正常浏览
 * 期间不重复拉。
 */
export const categoriesQueryKey = (spaceId: string | null) =>
  ["chat", "categories", spaceId ?? "_"] as const;

export function categoriesQueryOptions(spaceId: string | null) {
  return queryOptions({
    queryKey: categoriesQueryKey(spaceId),
    queryFn: async (): Promise<CategoryItem[]> => {
      if (!spaceId) return [];
      return listCategories(spaceId);
    },
    enabled: !!spaceId,
    staleTime: 60 * 1000,
  });
}
