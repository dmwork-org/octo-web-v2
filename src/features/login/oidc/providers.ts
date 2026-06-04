import type { OidcProvider } from "@/features/base/api/endpoints/oidc.api";

/**
 * SSO provider 列表卫生化(对齐老仓 dmworkbase Service/OidcConfig.ts):
 *
 * - 后端 /v1/common/appconfig 的 oidc_providers 数组是 raw snake_case,前端用
 *   `parseOidcProviders` 转 camelCase 并防御非法字段。
 * - `authorizePath` 必须是站内相对路径(以单个 `/` 起,**不**以 `//` 起),否则丢弃。
 *   防 javascript:/data:/双斜杠等协议注入 — authorize_path 会被拼进
 *   `window.location.href` 触发跳转。
 * - `accountUrl` / `resetPasswordUrl` 走 `sanitizeHttpUrl` 限定 http/https 协议
 *   (这两个走 `window.open`,即使配错也不让它跳到危险协议)。
 * - 任何字段缺失 / 类型不对 / 不安全的 entry 直接跳过,不抛错 — 配置坏了应退化
 *   到"无 SSO",而不是把整个 appconfig 拉崩。
 */

export function sanitizeHttpUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value === "") return undefined;
  try {
    const u = new URL(value);
    if (u.protocol === "https:" || u.protocol === "http:") return value;
  } catch {
    // invalid URL
  }
  return undefined;
}

function isSafeAuthorizePath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 2 &&
    value.startsWith("/") &&
    !value.startsWith("//")
  );
}

export function parseOidcProviders(raw: unknown): OidcProvider[] {
  if (!Array.isArray(raw)) return [];
  const out: OidcProvider[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const id = typeof r["id"] === "string" ? r["id"] : "";
    const name = typeof r["name"] === "string" ? r["name"] : "";
    if (!id || !name) continue;
    if (!isSafeAuthorizePath(r["authorize_path"])) continue;
    out.push({
      id,
      name,
      authorizePath: r["authorize_path"] as string,
      accountUrl: sanitizeHttpUrl(r["account_url"]),
      resetPasswordUrl: sanitizeHttpUrl(r["reset_password_url"]),
    });
  }
  return out;
}

/** 列表里按 id 找 provider(找不到 undefined)。 */
export function getProviderById(providers: OidcProvider[], id: string): OidcProvider | undefined {
  return providers.find((p) => p.id === id);
}
