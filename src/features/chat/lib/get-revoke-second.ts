import type { QueryClient } from "@tanstack/react-query";
import type { AppConfigRaw } from "@/features/base/api/endpoints/appconfig.api";
import { appConfigQueryKey } from "@/features/base/queries/appconfig.query";

/** 撤回时间窗口默认值(秒);对齐老仓 dmworkbase WKRemoteConfig 初始 2 * 60。 */
export const REVOKE_SECOND_FALLBACK = 120;

/**
 * 同步读 appConfig 缓存里的 revoke_second(秒)。
 *
 * **后端语义**(octo-server modules/common/api.go:413-417):
 *   - 数值 > 0:撤回时间窗口(秒)
 *   - -1:**无限制**(DB revoke_second=0 时后端转 -1 下发,对齐老仓 dmworkbase
 *     Service/revokePermission.ts:21 的 `revokeSecond <= 0` 不限分支)
 *
 * 仅在 cache 完全缺失(query 还没拉)时 fallback 120,避免新装/重启 race 窗口期内
 * 撤回菜单全部禁用。
 *
 * 设计:revoke 菜单计算在 render 内逐条触发,subscribe(useQuery)会让所有 message-row
 * 跟着 appConfig refetch 重渲。这里只读 cache 一次,不订阅;由上游(chat-main)
 * 调一次 useQuery(appConfigQueryOptions()) 保证 cache 命中即可。
 */
export function getRevokeSecondFromCache(qc: QueryClient): number {
  const data = qc.getQueryData<AppConfigRaw>(appConfigQueryKey);
  const raw = data?.revoke_second;
  if (typeof raw === "number") return raw; // 含 0 / -1(不限制信号)
  return REVOKE_SECOND_FALLBACK;
}
