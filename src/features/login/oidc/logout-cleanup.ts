/**
 * OIDC post-logout 清理 — 启动期最早调用的纯 helper(无任何外部 import)。
 *
 * 为什么独立成文件:
 * - main.tsx 启动需要在 persistAuth 之前调 `runPostLogoutCleanupIfNeeded`(清掉
 *   IdP 回源时可能带回的旧 token / pending)
 * - 如果挂在 oidc/logout.ts(它依赖 api/client → authStore),会触发循环加载
 *   `main.tsx → logout → client → auth → ...`,client.ts 拿不到 authStore
 *   导致 TDZ "Cannot access 'authStore' before initialization"
 * - 拆成独立文件,只操作 localStorage / sessionStorage,无任何依赖,可在任何
 *   生命周期点安全调用
 *
 * markOidcPostLogoutCleanup 由用户主动登出流程 (logout.ts) 在跳 IdP 前调;
 * runPostLogoutCleanupIfNeeded 由 main.tsx 在启动时调一次兜底。
 */

const OIDC_POST_LOGOUT_CLEANUP_KEY = "octo_oidc_post_logout_cleanup";

/** 标记"刚从 IdP 登出回来,启动时需再清一次本地状态"(sessionStorage,tab 关掉自动清)。 */
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

/** 启动期兜底清:IdP 回源到 /login 时,清掉残留的本地 auth/space localStorage。 */
export function runPostLogoutCleanupIfNeeded(): void {
  if (typeof window === "undefined") return;
  if (!consumeOidcPostLogoutCleanup()) return;
  clearLocalAuthStorage();
}

/**
 * 清本仓 auth 相关 localStorage / sessionStorage(对齐 auth.ts STORAGE_KEY + space store)。
 * 不依赖任何 store(纯 storage 操作),供启动期兜底用。
 */
export function clearLocalAuthStorage(): void {
  try {
    window.localStorage.removeItem("octo:auth");
    window.localStorage.removeItem("currentSpaceId");
    window.localStorage.removeItem("octo:chat:selected-channel");
  } catch {
    // ignore storage errors
  }
  try {
    window.sessionStorage.removeItem("pending_oidc_login");
  } catch {
    // ignore
  }
}
