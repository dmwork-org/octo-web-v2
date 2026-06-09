import { useQuery } from "@tanstack/react-query";
import { appConfigQueryOptions } from "@/features/base/queries/appconfig.query";

/**
 * 预热 appConfig query → message-row 同步读 revoke_second 时 cache 已就绪。
 *
 * `notifyOnChangeProps: []` 让 appConfig 数据变化不触发 caller 重渲(我们只关心副作用:
 * 让 query 进入 cache;数据由 message-row.getRevokeSecondFromCache 同步读)。
 */
export function useEnsureAppConfigLoaded(): void {
  useQuery({
    ...appConfigQueryOptions(),
    notifyOnChangeProps: [],
  });
}
