/**
 * Aegis 登录方式变更公告 — localStorage flag + Aegis 注册 URL 派生
 * (对齐上游 7de93ff1 LOGIN_MIGRATION_NOTICE_ACK_KEY + loginMigrationNoticeUrl)。
 *
 * 工作流:
 *   1. SSO 用户点登录 → 检查 hasAcknowledgedMigrationNotice
 *   2. 未确认 + appconfig.suppress_login_migration_notice 不为真 → 弹 modal
 *   3. 用户点"我已了解,继续登录"→ acknowledgeMigrationNotice + 真正起 SSO
 *   4. 用户点"去注册 Aegis 账号"→ 跳 IdP /register 页(基于 provider.accountUrl 派生)
 *
 * 设计:
 *   - flag key 带版本 `-v1-`:后续需要重新提示(改用户群)时升 v2,旧版用户也会再看一次
 *   - acknowledgement 是"per-browser"(localStorage),不是 per-user;用户换浏览器仍会再看
 */

const LOGIN_MIGRATION_NOTICE_ACK_KEY = "octo-login-migration-notice-v1-ack";
const AEGIS_REGISTER_PATH = "/register";

export function hasAcknowledgedMigrationNotice(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(LOGIN_MIGRATION_NOTICE_ACK_KEY) === "1";
  } catch {
    return false;
  }
}

export function acknowledgeMigrationNotice(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOGIN_MIGRATION_NOTICE_ACK_KEY, "1");
  } catch {
    // ignore localStorage errors(隐私模式)
  }
}

/**
 * 从当前 OIDC provider 的 `accountUrl` 派生 Aegis 注册页 URL。
 *
 * 复刻上游 `loginMigrationNoticeUrl.ts`:
 * - **不写 prod/test fallback URL**,避免发到错环境(对齐 MeInfo/realnameVerifyUrl 同款约束)
 * - 协议必须 http/https,其他返回 undefined → caller 应隐藏注册 CTA
 */
export function resolveAegisRegisterUrl(accountUrl: unknown): string | undefined {
  if (typeof accountUrl !== "string" || accountUrl.length === 0) return undefined;
  try {
    const parsed = new URL(accountUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return undefined;
    }
  } catch {
    return undefined;
  }
  return `${accountUrl.replace(/\/+$/, "")}${AEGIS_REGISTER_PATH}`;
}
