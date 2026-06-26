import { api } from "@/features/base/api/client";

/**
 * 应用配置(对应老仓 dmworkbase WKRemoteConfig 拉的 /v1/common/appconfig)。
 *
 * 后端在启动时一次性下发:
 * - `oidc_providers`:SSO provider 列表(snake_case raw,前端 parseOidcProviders 卫生化)
 * - `legacy_password_login_off`:1 = SSO 模式下隐藏本地密码登录;0/缺省 = 显示
 * - `disable_user_create_space`:1 = 隐藏普通用户"创建 Space"入口(对齐上游
 *   `43e7d354`);0/缺省 = 显示。**只影响创建,不影响加入**;值用 `parseRemoteBool`
 *   解析(后端可能下发 int 或 string)。本仓现阶段无创建入口,字段透传供后续使用。
 * - `messages_search_on`:1 = 显示会话内聊天记录搜索入口;0/缺省 = 隐藏。
 * - 其余:版本号 / android apk / 帮助链接等(本期不消费)
 *
 * 调用频率极低(单次启动 + 偶尔刷新),配 staleTime 5min 足够。
 */

export interface AppConfigRaw {
  oidc_providers?: unknown;
  legacy_password_login_off?: number;
  /** 撤回时间窗口(秒),对齐老仓 dmworkbase WKRemoteConfig.revokeSecond,缺省 120。 */
  revoke_second?: number;
  /** 普通用户"创建 Space"入口开关:1 / "1" / true / "true" → 隐藏;走 parseRemoteBool。 */
  disable_user_create_space?: number | string | boolean;
  /** 会话内聊天记录搜索开关:1 / "1" / true / "true" → 显示入口;缺省关闭。 */
  messages_search_on?: number | string | boolean;
  /**
   * Aegis 登录方式变更公告开关(对齐上游 `7de93ff1`):1 → 服务端强制隐藏
   * Aegis migration modal(部署侧已通过其他渠道告知用户,前端不再二次提示);
   * 0/缺省 → 走前端 localStorage flag(per-browser 一次性)。
   */
  suppress_login_migration_notice?: number | string | boolean;
  /** 其他字段保留 raw,后续按需 parse。 */
  [key: string]: unknown;
}

export async function getAppConfig(): Promise<AppConfigRaw> {
  return api<AppConfigRaw>("common/appconfig");
}
