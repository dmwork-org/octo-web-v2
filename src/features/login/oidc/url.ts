import type { OidcProvider } from "@/features/base/api/endpoints/oidc.api";

/**
 * SSO 授权跳转 URL 构造(对齐老仓 dmworklogin/src/oidc/url.ts):
 *
 * - `authcode` 由 GET /v1/user/thirdlogin/authcode 拿到
 * - `return_to` 默认 `/login`(回调点),IdP 校验后会带 `?oidc_error=1`(失败)或
 *   原样 302(成功 → 触发 resume poll)
 * - `flag=1` = web 设备类型(对齐 WuKongIM JS SDK 硬编码),后端在 OIDC 回调
 *   时把 flag 写入 IM device-token 行;WS CONNECT 时按 (uid, device_flag, token)
 *   三元组查表,**flag 不对会让 IM socket 静默关闭**(no CONNACK)。
 */

const DEFAULT_RETURN_TO = "/login";
const DEFAULT_FLAG = "1";

export function buildAuthorizeURL(
  provider: OidcProvider,
  authcode: string,
  returnTo: string = DEFAULT_RETURN_TO,
): string {
  const params = new URLSearchParams();
  params.set("authcode", authcode);
  params.set("return_to", returnTo);
  params.set("flag", DEFAULT_FLAG);
  return `${provider.authorizePath}?${params.toString()}`;
}

export interface OidcUrlState {
  /** IdP 回调时 `?oidc_error=1` → 显示错误 toast 并不触发 poll。 */
  error: boolean;
}

/** 解析 `location.search`(传入完整 search 串,带不带 `?` 都可)。 */
export function parseOidcUrlState(search: string): OidcUrlState {
  const normalized = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(normalized);
  return { error: params.get("oidc_error") === "1" };
}
