import { useRef, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FollowSortItem, sortFollows } from "@/features/base/api/endpoints/follow.api";
import {
  type SidebarFollowDerived,
  sidebarFollowQueryKey,
} from "@/features/chat/queries/sidebar.query";
import { SidebarTargetType } from "@/features/base/api/endpoints/sidebar.api";
import { toast } from "@/components/semi-bridge/toast";

/**
 * 关注 tab 拖拽排序 — 1:1 对齐旧 dmworkbase ChatConversationList.handleSortFollowItems
 * (行 132-163) + ConversationListGrouped handleDragEnd 同分组 item→item 分支(行 188-218)。
 *
 * **后端契约**(/follow/sort PUT,FollowService.sort):
 * - body:`{ items: [{ target_type, target_id, sort }], version }`
 * - version 是 user_follow_version(CAS 乐观锁,sidebar.query 返回 followVersion)
 * - 服务端按 items 数组下标作 sort 值,group 下面紧跟它的已关注子区(否则后端不更新
 *   子区 follow_sort,旧值会让子区在 sidebar 漂离父群)
 *
 * **本 hook 职责**:
 * - 同分组内重排 → 调用方传 `(spaceId, categoryId, orderedTargets)`,内部:
 *   1) 转换成 FollowSortItem[](sort = index)
 *   2) PUT /follow/sort + version
 *   3) 乐观更新 sidebar query cache(避免 dnd-kit 弹回 + reload 后再闪动)
 *   4) version conflict → invalidate + 重试 1 次
 *   5) 最终成功:bump version + 不重拉(已乐观更新);失败:invalidate 兜底
 *
 * **不处理**:跨分组移动(复用右键菜单 moveGroupToCategory / followDM 覆盖)。
 */
export function useSortFollow(spaceId: string | null) {
  const qc = useQueryClient();
  // 用 ref 持 versionRef:连续拖拽时闭包持有旧值会 CAS 冲突 — 跟老仓 versionRef 同款。
  const versionRef = useRef<number>(0);

  const applyOptimistic = useCallback(
    (categoryId: string, orderedTargets: { target_type: number; target_id: string }[]) => {
      const key = sidebarFollowQueryKey(spaceId);
      qc.setQueryData<SidebarFollowDerived>(key, (prev) => {
        if (!prev) return prev;
        const oldList = prev.itemsByCategory.get(categoryId) ?? [];
        // 按 orderedTargets 顺序重组 oldList(orderedTargets 已是新顺序,**含子区跟随父群**)
        const lookup = new Map(
          oldList.map((it) => [`${it.target_type}::${it.target_id}`, it] as const),
        );
        const newList = orderedTargets
          .map((t) => lookup.get(`${t.target_type}::${t.target_id}`))
          .filter((x): x is NonNullable<typeof x> => !!x);
        // oldList 里没在新顺序里的(理论不该发生)— 追加保兜底
        for (const it of oldList) {
          if (
            !orderedTargets.some(
              (t) => `${t.target_type}::${t.target_id}` === `${it.target_type}::${it.target_id}`,
            )
          ) {
            newList.push(it);
          }
        }
        const nextMap = new Map(prev.itemsByCategory);
        nextMap.set(categoryId, newList);
        return { ...prev, itemsByCategory: nextMap };
      });
    },
    [qc, spaceId],
  );

  const sortMu = useMutation({
    mutationFn: async (args: {
      categoryId: string;
      orderedTargets: { target_type: number; target_id: string }[];
    }) => {
      const payload: FollowSortItem[] = args.orderedTargets.map((t, idx) => ({
        target_type: t.target_type,
        target_id: t.target_id,
        sort: idx,
      }));
      try {
        await sortFollows(payload, versionRef.current);
        versionRef.current += 1;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // version conflict → reload 拿新 version + 重试 1 次(对齐老仓行 148-155)
        if (msg.includes("version conflict")) {
          await qc.refetchQueries({ queryKey: sidebarFollowQueryKey(spaceId) });
          const latest = qc.getQueryData<SidebarFollowDerived>(sidebarFollowQueryKey(spaceId));
          versionRef.current = latest?.followVersion ?? versionRef.current;
          await sortFollows(payload, versionRef.current);
          versionRef.current += 1;
        } else {
          throw err;
        }
      }
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "排序失败");
      // 失败时 invalidate 让 UI 回到服务端真值
      void qc.invalidateQueries({ queryKey: sidebarFollowQueryKey(spaceId) });
    },
  });

  /**
   * 调用方:dnd-kit handleDragEnd 算出新 group/dm 顺序后调本函数。
   *
   * @param orderedItems 同 category 内的新顺序 — 只包 group / dm(子区由本函数附加)
   * @param threadsByGroup 父群 → 已关注子区 list(用于群下面紧跟子区,对齐老仓行 207-215)
   */
  const sortCategory = useCallback(
    (
      categoryId: string,
      version: number,
      orderedItems: { target_type: number; target_id: string }[],
      threadsByGroup: Map<string, { channelID: string }[]>,
    ) => {
      versionRef.current = version;
      // 群下面紧跟其已关注子区,保证子区 follow_sort 不漂(老仓 sortItems 拼装逻辑)
      const expanded: { target_type: number; target_id: string }[] = [];
      for (const it of orderedItems) {
        expanded.push(it);
        if (it.target_type === SidebarTargetType.CHANNEL) {
          const childThreads = threadsByGroup.get(it.target_id) ?? [];
          for (const t of childThreads) {
            expanded.push({
              target_type: SidebarTargetType.THREAD,
              target_id: t.channelID,
            });
          }
        }
      }
      applyOptimistic(categoryId, expanded);
      sortMu.mutate({ categoryId, orderedTargets: expanded });
    },
    [applyOptimistic, sortMu],
  );

  return { sortCategory, isPending: sortMu.isPending };
}
