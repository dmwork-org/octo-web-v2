import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { appConfigQueryOptions } from "@/features/base/queries/appconfig.query";
import { parseOidcProviders } from "@/features/login/oidc/providers";
import type { OidcProvider } from "@/features/base/api/endpoints/oidc.api";

/**
 * SSO providers + legacy_password_login_off flag(对齐老仓 dmworklogin/login.tsx 顶部
 * `const providers = WKApp.remoteConfig.oidcProviders`)。
 *
 * - 拉一次 appconfig,parse 出 OidcProvider[](已 sanitize)
 * - 暴露 legacyPasswordLoginOff:SSO 模式下隐藏本地密码表单的开关
 * - 都是 read-only 派生,无 mutate
 */
export function useSsoProviders(): {
  providers: OidcProvider[];
  /** 取第一个 provider(本期 ≤ 1 个 — 老仓注释)。 */
  primaryProvider: OidcProvider | undefined;
  /** true = 隐藏本地密码表单,只显 SSO CTA。 */
  legacyPasswordLoginOff: boolean;
  isLoading: boolean;
} {
  const { data, isLoading } = useQuery(appConfigQueryOptions());
  const providers = useMemo(() => parseOidcProviders(data?.oidc_providers), [data]);
  const legacyOff =
    typeof data?.legacy_password_login_off === "number" && data.legacy_password_login_off === 1;
  return {
    providers,
    primaryProvider: providers[0],
    legacyPasswordLoginOff: legacyOff,
    isLoading,
  };
}
