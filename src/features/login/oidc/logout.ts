/**
 * OIDC logout 流程(对齐上游 86c5837b oidcLogout.ts):
 *
 * 完整流程:
 *   1. 用户点登出 → 检查 user.login_provider
 *   2. SSO 登录 → `requestOidcLogout(providerId, token)` 调后端拿
 *      `end_session_url`
 *   3. `markOidcPostLogoutCleanup()` 在 sessionStorage 写标志
 *   4. 清本地 auth + space + localStorage 残留
 *   5. `window.location.href = end_session_url` 跳 IdP 登出页
 *   6. IdP 登出后 redirect 回 `/login` → main.tsx 启动时
 *      `consumeOidcPostLogoutCleanup()` 二次清理(兜底,IdP 回源可能带回
 *      旧 cookie/token)
 *
 * 失败兜底:任何步骤失败 → fallback 走原本地 signOut(authStore 清 + 跳 /login)。
 */

import { api } from "@/features/base/api/client";
import { authStore } from "@/features/base/stores/auth";

const OIDC_POST_LOGOUT_CLEANUP_KEY = "octo_oidc_post_logout_cleanup";

/** "local" 不算 SSO,空串也不算;其他非空 string 视为合法 SSO provider id。 */
export function isOidcLoginProvider(providerId: unknown): providerId is string {
  return typeof providerId === "string" && providerId !== "" && providerId !== "local";
}

export interface OidcLogoutResponse {
  end_session_url?: string;
}

/**
 * 调后端 `POST /v1/auth/oidc/{providerId}/logout` 拿 IdP `end_session_url`。
 * 用本仓 `api` client 走 ofetch interceptor(自动注入 token / X-Space-Id /
 * 401 重定向 / 错误 toast)。
 */
export async function requestOidcLogout(providerId: string): Promise<OidcLogoutResponse> {
  return api<OidcLogoutResponse>(`auth/oidc/${encodeURIComponent(providerId)}/logout`, {
    method: "POST",
  });
}

/** 校验 IdP 返回的 end_session_url 必须是 http/https,防 javascript: 等协议注入。 */
export function safeEndSessionUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value === "") return undefined;
  try {
    const parsed = new URL(value);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return value;
    }
  } catch {
    // invalid URL
  }
  return undefined;
}

/**
 * 在 sessionStorage 标记"刚从 IdP 登出回来,启动时需再清一次本地状态"。
 * 用 sessionStorage 而非 localStorage:tab 关掉就清,不让标志跨 session 残留。
 */
export function markOidcPostLogoutCleanup(): void {
  try {
    window.sessionStorage.setItem(OIDC_POST_LOGOUT_CLEANUP_KEY, "1");
  } catch {
    // sessionStorage 不可用(隐私模式),不致命,跳过
  }
}

/** 读 + 清 cleanup 标志;返回是否需要兜底清理。 */
export function consumeOidcPostLogoutCleanup(): boolean {
  try {
    const marked = window.sessionStorage.getItem(OIDC_POST_LOGOUT_CLEANUP_KEY) === "1";
    if (marked) window.sessionStorage.removeItem(OIDC_POST_LOGOUT_CLEANUP_KEY);
    return marked;
  } catch {
    return false;
  }
}

/**
 * 用户主动登出 — SSO 走完整流程,非 SSO 走 fallback。
 *
 * 不直接 export 给业务用,业务调 `authActions.signOut()` 即可,
 * signOut 内部 wire 到本函数。
 */
export async function logoutUserInitiated(fallback: () => void): Promise<void> {
  const user = authStore.state.user;
  const token = authStore.state.token;
  const providerId = user?.login_provider;

  if (!isOidcLoginProvider(providerId) || !token) {
    fallback();
    return;
  }

  try {
    const resp = await requestOidcLogout(providerId);
    const endSessionUrl = safeEndSessionUrl(resp.end_session_url);
    if (endSessionUrl) {
      markOidcPostLogoutCleanup();
      // 不调 fallback() — 它会跳 /login,我们要跳 IdP 的 end_session_url
      clearLocalAuthState();
      window.location.href = endSessionUrl;
      return;
    }
  } catch (err) {
    console.warn("OIDC logout failed, falling back to local logout", err);
  }

  fallback();
}

/**
 * 启动时兜底清:IdP 回源到 /login 时,清掉可能残留的本地 auth/space localStorage。
 * 在 main.tsx 入口同步调用一次。
 */
export function runPostLogoutCleanupIfNeeded(): void {
  if (typeof window === "undefined") return;
  if (!consumeOidcPostLogoutCleanup()) return;
  clearLocalAuthState();
}

function clearLocalAuthState(): void {
  try {
    window.localStorage.removeItem("octo:auth");
    window.localStorage.removeItem("currentSpaceId");
  } catch {
    // ignore storage errors
  }
  try {
    window.sessionStorage.removeItem("pending_oidc_login");
  } catch {
    // ignore
  }
}
