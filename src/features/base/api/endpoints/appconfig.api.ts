import { api } from "@/features/base/api/client";

/**
 * 应用配置(对应老仓 dmworkbase WKRemoteConfig 拉的 /v1/common/appconfig)。
 *
 * 后端在启动时一次性下发:
 * - `oidc_providers`:SSO provider 列表(snake_case raw,前端 parseOidcProviders 卫生化)
 * - `legacy_password_login_off`:1 = SSO 模式下隐藏本地密码登录;0/缺省 = 显示
 * - 其余:版本号 / android apk / 帮助链接等(本期不消费)
 *
 * 调用频率极低(单次启动 + 偶尔刷新),配 staleTime 5min 足够。
 */

export interface AppConfigRaw {
  oidc_providers?: unknown;
  legacy_password_login_off?: number;
  /** 其他字段保留 raw,后续按需 parse。 */
  [key: string]: unknown;
}

export async function getAppConfig(): Promise<AppConfigRaw> {
  return api<AppConfigRaw>("common/appconfig");
}
