import type { QueryClient } from "@tanstack/react-query";
import type { AppConfigRaw } from "@/features/base/api/endpoints/appconfig.api";
import { appConfigQueryKey } from "@/features/base/queries/appconfig.query";

/** 撤回时间窗口默认值(秒);对齐老仓 dmworkbase WKRemoteConfig 初始 2 * 60。 */
export const REVOKE_SECOND_FALLBACK = 120;

/**
 * 同步读 appConfig 缓存里的 revoke_second(秒)。缺失或类型异常 → fallback 120。
 *
 * 设计:revoke 菜单计算在 render 内逐条触发,subscribe(useQuery)会让所有 message-row
 * 跟着 appConfig refetch 重渲。这里只读 cache 一次,不订阅;由上游(chat-main)
 * 调一次 useQuery(appConfigQueryOptions()) 保证 cache 命中即可。
 */
export function getRevokeSecondFromCache(qc: QueryClient): number {
  const data = qc.getQueryData<AppConfigRaw>(appConfigQueryKey);
  const raw = data?.revoke_second;
  if (typeof raw === "number" && raw > 0) return raw;
  return REVOKE_SECOND_FALLBACK;
}
