import { queryOptions } from "@tanstack/react-query";
import {
  type SidebarItem,
  SidebarTargetType,
  syncSidebar,
} from "@/features/base/api/endpoints/sidebar.api";

/**
 * Sidebar follow tab 聚合数据(对应旧 dmworkbase useFollowSidebar):
 *
 * 拉 /v1/sidebar/sync(tab=follow),把 items 派生成 4 个 Map/Set 给 follow-list 用:
 * - itemsByCategory: 全类型按 category_id 分桶,每桶按 follow_sort ASC
 *   渲染按这个顺序铺,**不再按 timestamp 重排**(否则用户手动排序结果不可见)
 * - dmsByCategory / threadsByCategory: 按 category 分桶的 DM / 子区(便于子菜单)
 * - followedGroupNos: 已关注群 group_no Set(配合 categories API 求交)
 * - followedKeys: 全类型已关注 Set,key=`${target_type}::${target_id}`
 *   渲染父群下子区时与此求交,IM 仍有活跃但已 unfollow 的子区不显示
 *
 * spaceId 进 queryKey;切 Space 由 main.tsx 的 spaceStore.subscribe → queryClient.clear() 兜底。
 *
 * staleTime 30s — 用户主动 follow / unfollow 后由 mutation onSuccess invalidate 触发重拉,
 * 正常浏览期间不重复拉。
 */

const NULL_CATEGORY = "";

export interface SidebarFollowDerived {
  items: SidebarItem[];
  followVersion: number;
  itemsByCategory: Map<string, SidebarItem[]>;
  dmsByCategory: Map<string, SidebarItem[]>;
  threadsByCategory: Map<string, SidebarItem[]>;
  followedGroupNos: Set<string>;
  followedKeys: Set<string>;
}

export interface SidebarRecentDerived {
  items: SidebarItem[];
  recentKeys: Set<string>;
  recentOrder: Map<string, number>;
}

function deriveFromItems(items: SidebarItem[], followVersion: number): SidebarFollowDerived {
  const itemsByCategory = new Map<string, SidebarItem[]>();
  const dmsByCategory = new Map<string, SidebarItem[]>();
  const threadsByCategory = new Map<string, SidebarItem[]>();
  const followedGroupNos = new Set<string>();
  const followedKeys = new Set<string>();

  for (const it of items) {
    const key = it.category_id ?? NULL_CATEGORY;
    const all = itemsByCategory.get(key) ?? [];
    all.push(it);
    itemsByCategory.set(key, all);
    followedKeys.add(`${it.target_type}::${it.target_id}`);

    if (it.target_type === SidebarTargetType.DM) {
      const list = dmsByCategory.get(key) ?? [];
      list.push(it);
      dmsByCategory.set(key, list);
    } else if (it.target_type === SidebarTargetType.THREAD) {
      const list = threadsByCategory.get(key) ?? [];
      list.push(it);
      threadsByCategory.set(key, list);
    } else if (it.target_type === SidebarTargetType.CHANNEL) {
      followedGroupNos.add(it.target_id);
    }
  }

  // 每个 category 内按 follow_sort ASC 排,覆盖 sidebar 响应里的 (pinned DESC, follow_sort ASC)
  // 多键排序;PM #337 spec 是用户主导的统一排序,pinned 只是标记不影响位置。
  // 没 follow_sort 的项(刚加入还没 sort 过)排到最后。
  for (const list of itemsByCategory.values()) {
    list.sort((a, b) => {
      const sa = a.follow_sort ?? Number.MAX_SAFE_INTEGER;
      const sb = b.follow_sort ?? Number.MAX_SAFE_INTEGER;
      return sa - sb;
    });
  }

  return {
    items,
    followVersion,
    itemsByCategory,
    dmsByCategory,
    threadsByCategory,
    followedGroupNos,
    followedKeys,
  };
}

export const sidebarFollowQueryKey = (spaceId: string | null) =>
  ["chat", "sidebar", "follow", spaceId ?? "_"] as const;

export function sidebarFollowQueryOptions(spaceId: string | null) {
  return queryOptions({
    queryKey: sidebarFollowQueryKey(spaceId),
    queryFn: async (): Promise<SidebarFollowDerived> => {
      if (!spaceId) {
        return deriveFromItems([], 0);
      }
      const resp = await syncSidebar({ tab: "follow" });
      return deriveFromItems(resp.items ?? [], resp.follow_version ?? 0);
    },
    enabled: !!spaceId,
    staleTime: 30 * 1000,
  });
}

export const sidebarRecentQueryKey = (spaceId: string | null) =>
  ["chat", "sidebar", "recent", spaceId ?? "_"] as const;

export function sidebarRecentQueryOptions(spaceId: string | null) {
  return queryOptions({
    queryKey: sidebarRecentQueryKey(spaceId),
    queryFn: async (): Promise<SidebarRecentDerived> => {
      if (!spaceId) {
        return { items: [], recentKeys: new Set<string>(), recentOrder: new Map<string, number>() };
      }
      const resp = await syncSidebar({ tab: "recent" });
      const items = resp.items ?? [];
      const recentKeys = new Set<string>();
      const recentOrder = new Map<string, number>();
      for (const it of items) {
        const key = `${it.target_type}::${it.target_id}`;
        recentKeys.add(key);
        recentOrder.set(key, it.timestamp);
      }
      return { items, recentKeys, recentOrder };
    },
    enabled: !!spaceId,
    staleTime: 30 * 1000,
  });
}
