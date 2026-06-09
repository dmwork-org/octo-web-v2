import { useQuery } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import { getMyGroups } from "@/features/base/api/endpoints/group.api";
import { spaceStore } from "@/features/base/stores/space";

/**
 * 拉取当前用户在当前 Space 下加入的所有群。
 *
 * 返回群号集合 + 加载/错误状态，用于判断 Matter 关联群聊的成员权限。
 * staleTime 5 分钟 — 群列表不常变。
 */
export function useMyGroups() {
  const spaceId = useStore(spaceStore, (s) => s.spaceId);

  return useQuery({
    queryKey: ["groups", "my", spaceId ?? "_"] as const,
    queryFn: () => getMyGroups(spaceId!),
    enabled: !!spaceId,
    staleTime: 5 * 60 * 1000,
  });
}
