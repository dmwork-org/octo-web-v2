import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { appConfigQueryOptions } from "@/features/base/queries/appconfig.query";
import { parseOidcProviders } from "@/features/login/oidc/providers";
import type { OidcProvider } from "@/features/base/api/endpoints/oidc.api";

/**
 * SSO providers + legacy_password_login_off flag(对齐老仓 dmworklogin/login.tsx):
 *
 * **两层 gate**:
 *  1. **build-time env**:`VITE_ENABLE_ENTERPRISE_SSO === 'true'` — 否则
 *     直接返回空 providers(不调 appconfig parse,UI 不渲染任何 SSO 入口)。
 *     这跟老仓一致:env 决定"代码层是否启用 SSO 模块",appconfig 决定"启用后有哪些 provider"。
 *  2. **runtime appconfig**:env 启用前提下,appconfig.oidc_providers parse + sanitize
 *     后才决定具体显哪个 provider。
 *
 * - `legacyPasswordLoginOff`:env + appconfig 双启用时,后端 flag = 1 → 隐藏本地密码表单
 * - env 未启用时,所有衍生值都返"无 SSO",`legacyPasswordLoginOff` 强制 false
 *   (保留密码登录,因为没有 SSO 兜底)
 */

const ENTERPRISE_SSO_ENABLED = import.meta.env.VITE_ENABLE_ENTERPRISE_SSO === "true";

export function useSsoProviders(): {
  providers: OidcProvider[];
  /** 取第一个 provider(本期 ≤ 1 个 — 老仓注释)。env 未启用时永远 undefined。 */
  primaryProvider: OidcProvider | undefined;
  /** true = 隐藏本地密码表单,只显 SSO CTA。env 未启用时永远 false。 */
  legacyPasswordLoginOff: boolean;
  isLoading: boolean;
  /** Build-time 是否启用了 SSO 模块(env)。view 决定是否渲染 SSO UI 块。 */
  ssoModuleEnabled: boolean;
} {
  // env 未启用 → 不调 appconfig,直接返空
  const { data, isLoading } = useQuery({
    ...appConfigQueryOptions(),
    enabled: ENTERPRISE_SSO_ENABLED,
  });
  const providers = useMemo(
    () => (ENTERPRISE_SSO_ENABLED ? parseOidcProviders(data?.oidc_providers) : []),
    [data],
  );
  const legacyOff =
    ENTERPRISE_SSO_ENABLED &&
    typeof data?.legacy_password_login_off === "number" &&
    data.legacy_password_login_off === 1;
  return {
    providers,
    primaryProvider: providers[0],
    legacyPasswordLoginOff: legacyOff,
    isLoading: ENTERPRISE_SSO_ENABLED ? isLoading : false,
    ssoModuleEnabled: ENTERPRISE_SSO_ENABLED,
  };
}
