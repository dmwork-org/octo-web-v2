import { queryOptions, useQuery } from "@tanstack/react-query";
import { getAppConfig, type AppConfigRaw } from "@/features/base/api/endpoints/appconfig.api";
import { parseRemoteBool } from "@/features/base/lib/parse-remote-bool";

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

/**
 * 普通用户是否可以创建 Space(对齐上游 `43e7d354` disableUserCreateSpace)。
 *
 * - true(默认 / appconfig 不返回 disable 字段) → 显示创建入口
 * - false(后端 disable_user_create_space = 1 / "1" / true / "true") → 隐藏创建入口
 *
 * 加载期(query loading)默认返回 true(乐观假设),避免登录后短暂隐藏入口。
 * 任何"创建 Space"入口都应该用本 hook 守门。
 */
export function useCanCreateSpace(): boolean {
  const { data } = useQuery(appConfigQueryOptions());
  if (!data) return true;
  return !parseRemoteBool(data.disable_user_create_space);
}

/**
 * 会话内聊天记录搜索是否启用(对齐老仓 WKRemoteConfig.messagesSearchOn)。
 *
 * 后端未下发 `messages_search_on` 时默认关闭,避免前端入口早于搜索接口上线。
 */
export function useMessagesSearchEnabled(): boolean {
  const { data } = useQuery(appConfigQueryOptions());
  return parseRemoteBool(data?.messages_search_on);
}

/**
 * 自定义贴纸入口是否启用(对齐老仓 WKRemoteConfig.stickerCustomEnabled)。
 *
 * 后端未下发 `sticker_custom_enabled` 时默认关闭,避免入口早于后端能力或灰度开关暴露。
 */
export function useStickerCustomEnabled(): boolean {
  const { data } = useQuery(appConfigQueryOptions());
  return parseRemoteBool(data?.sticker_custom_enabled);
}
