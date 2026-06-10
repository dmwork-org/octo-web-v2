/**
 * OIDC logout 用户主动流程(对齐上游 86c5837b oidcLogout.ts logoutUserInitiated):
 *
 * 完整流程:
 *   1. 用户点登出 → 检查 user.login_provider
 *   2. SSO 登录 → `requestOidcLogout(providerId)` 调后端拿 `end_session_url`
 *   3. `markOidcPostLogoutCleanup()` 在 sessionStorage 写标志
 *   4. 清本地 auth + space + localStorage 残留
 *   5. `window.location.href = end_session_url` 跳 IdP 登出页
 *   6. IdP 登出后 redirect 回 `/login` → main.tsx 启动时
 *      `runPostLogoutCleanupIfNeeded()` 二次清理(兜底)
 *
 * 失败兜底:任何步骤失败 → fallback 走原本地 signOut(authStore 清 + 跳 /login)。
 *
 * **加载时机**:本文件依赖 api/client 和 authStore,**不能** top-level 被 main.tsx 或
 * auth.ts 静态 import(会造成 `auth → logout → client → auth` 循环加载,client.ts
 * 拿不到 authStore 触发 TDZ)。改由 auth.signOut 内部 dynamic import 加载。
 * 启动期需要的 cleanup helpers 已拆到 `./logout-cleanup.ts`(无依赖)。
 */

import { api } from "@/features/base/api/client";
import { authStore } from "@/features/base/stores/auth";
import {
  clearLocalAuthStorage,
  markOidcPostLogoutCleanup,
} from "@/features/login/oidc/logout-cleanup";

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
 * 用户主动登出 — SSO 走完整流程,非 SSO 走 fallback。
 *
 * 不直接 export 给业务用,业务调 `authActions.signOut()` 即可,
 * signOut 内部 dynamic import 本函数。
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
      clearLocalAuthStorage();
      window.location.href = endSessionUrl;
      return;
    }
  } catch (err) {
    console.warn("OIDC logout failed, falling back to local logout", err);
  }

  fallback();
}
