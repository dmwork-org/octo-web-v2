import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import { authStore } from "@/features/base/stores/auth";
import { spaceActions, spaceStore } from "@/features/base/stores/space";
import { mySpacesQueryOptions } from "@/features/base/queries/spaces.query";

/**
 * Space 初始化(对齐旧 MainPage.componentDidMount):
 *
 * 登录后:
 * 1. GET /v1/space/my(走 mySpacesQueryOptions,共享缓存)
 * 2. 如果当前 spaceId 在 spaces 中可找到 → 不动
 * 3. 否则取 spaces[0]?.space_id ?? null → spaceActions.setSpace
 *
 * setSpace 触发 persistSpace 写 localStorage + main.tsx 的 spaceStore.subscribe 清空
 * queryClient.cache(切换 Space 必须重拉 Space 维度数据)。
 *
 * 挂在 AppShell — 进所有 _auth 路由的根。未登录时(token 为 null)hook 不发请求。
 */
export function useEnsureSpace() {
  const hasToken = useStore(authStore, (s) => !!s.token);
  const currentSpaceId = useStore(spaceStore, (s) => s.spaceId);
  const { data: spaces } = useQuery({
    ...mySpacesQueryOptions(),
    enabled: hasToken,
  });

  useEffect(() => {
    if (!spaces) return;
    if (currentSpaceId && spaces.some((s) => s.space_id === currentSpaceId)) {
      // 当前已选的 Space 仍然有效,不动
      return;
    }
    const fallback = spaces[0]?.space_id ?? null;
    if (fallback !== currentSpaceId) {
      spaceActions.setSpace(fallback);
    }
  }, [spaces, currentSpaceId]);
}
