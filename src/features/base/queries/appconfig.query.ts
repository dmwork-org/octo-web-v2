import { queryOptions } from "@tanstack/react-query";
import { getAppConfig, type AppConfigRaw } from "@/features/base/api/endpoints/appconfig.api";

/**
 * 应用配置 query — provider 列表 / legacy_password_login_off / 等。
 *
 * staleTime 5 分钟:配置低频变更,无需每次 mount 重拉。
 */
export const appConfigQueryKey = ["base", "appconfig"] as const;

export const appConfigQueryOptions = () =>
  queryOptions({
    queryKey: appConfigQueryKey,
    queryFn: async (): Promise<AppConfigRaw> => getAppConfig(),
    staleTime: 5 * 60 * 1000,
    // 即使在 /login 页(未登录)也能调,后端 /common/appconfig 不要求 token
    retry: 1,
  });
