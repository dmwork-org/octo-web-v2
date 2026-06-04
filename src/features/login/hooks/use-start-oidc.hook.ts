import { useState, useEffect, useRef } from "react";
import { getOidcAuthcode, type OidcProvider } from "@/features/base/api/endpoints/oidc.api";
import { savePendingOidcLogin } from "@/features/login/oidc/pending";
import { buildAuthorizeURL } from "@/features/login/oidc/url";
import { extractSafeErrorMessage } from "@/features/login/lib/sanitize-error";

/**
 * SSO 起手 hook(对齐老仓 LoginVM.startOidcLogin):
 *
 * 1. 调 `getOidcAuthcode()` 拿 authcode
 * 2. `savePendingOidcLogin({ providerId, authcode, savedAt: Date.now() })`
 * 3. `window.location.href = buildAuthorizeURL(provider, authcode, /login)`
 *
 * **5s fallback reset**(对齐老仓 OIDC_LOADING_RESET_MS):若 redirect 被
 * popup blocker / beforeunload 拦住,5s 后强制把 loading 关掉,不让按钮卡死。
 */

const OIDC_LOADING_RESET_MS = 5000;

/** 由 component 命名 hook 封装 setTimeout(对齐 no-useeffect-in-component)。 */
function useOidcLoadingResetTimer(
  loading: boolean,
  setLoading: (v: boolean) => void,
  enabled: boolean,
) {
  useEffect(() => {
    if (!enabled || !loading) return;
    const t = setTimeout(() => setLoading(false), OIDC_LOADING_RESET_MS);
    return () => clearTimeout(t);
  }, [loading, enabled, setLoading]);
}

export function useStartOidcLogin(): {
  startOidc: (provider: OidcProvider) => Promise<void>;
  loading: boolean;
  error: string | null;
} {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 避免多点重入(虽然 loading 已有 guard,但跳走前的微短窗口仍可能 double-click)
  const inflightRef = useRef(false);

  // redirect 被拦截兜底:5s 自动关 loading
  useOidcLoadingResetTimer(loading, setLoading, true);

  const startOidc = async (provider: OidcProvider) => {
    if (inflightRef.current) return;
    inflightRef.current = true;
    setError(null);
    setLoading(true);
    try {
      const { authcode } = await getOidcAuthcode();
      savePendingOidcLogin({
        providerId: provider.id,
        authcode,
        savedAt: Date.now(),
      });
      const returnTo = `${window.location.origin}/login`;
      window.location.href = buildAuthorizeURL(provider, authcode, returnTo);
      // 不重置 loading — 等 redirect。即使 redirect 被拦,5s reset timer 会兜底。
    } catch (e) {
      setError(extractSafeErrorMessage(e));
      setLoading(false);
      inflightRef.current = false;
      throw e;
    }
  };

  return { startOidc, loading, error };
}
