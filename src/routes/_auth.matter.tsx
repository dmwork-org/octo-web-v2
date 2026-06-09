import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { authStore } from "@/features/base/stores/auth";
import { spaceStore } from "@/features/base/stores/space";
import { mattersListInfiniteQueryOptions } from "@/features/matter/queries/matters.query";
import { MatterView } from "@/features/matter/views/matter.view";

/**
 * URL search:
 * - id: 选中事项 ID，刷新保留。id 缺省 → 右侧空状态。
 * - tab: 列表 tab（mine/created/all），刷新保留。
 * - q: 搜索关键词，刷新保留。
 */
const matterSearchSchema = z.object({
  id: z.string().optional(),
  tab: z.enum(["mine", "created", "all"]).optional(),
  q: z.string().optional(),
});

export const Route = createFileRoute("/_auth/matter")({
  validateSearch: matterSearchSchema,
  /**
   * 首屏预热"我负责的"infinite list — spaceId/myUid 同步从 store 读取。
   * 任一缺失则跳过预热,组件挂载时 useInfiniteQuery 的 enabled 自动兜住。
   */
  loader: ({ context }) => {
    const spaceId = spaceStore.state.spaceId;
    const myUid = authStore.state.user?.uid;
    if (!spaceId || !myUid) return;
    return context.queryClient.ensureInfiniteQueryData(
      mattersListInfiniteQueryOptions(spaceId, { assignee_id: myUid }),
    );
  },
  staticData: { menu: { sort: 4001, title: "matter.menu.title", icon: "matter" } },
  component: MatterView,
});
