import { OIDC_AUTHCODE_TTL_MS } from "@/features/base/api/endpoints/oidc.api";

/**
 * Pending OIDC session(对齐老仓 dmworklogin/src/oidc/pending.ts)。
 *
 * 跳转 SSO 前必须把 `{ providerId, authcode, savedAt }` 写到 sessionStorage,
 * 因为 IdP 回调 / 用户刷新 后,前端要靠这条记录知道:
 *   1. 当前正处于 OIDC 流程(不是普通登录页)
 *   2. 用哪个 authcode 去 poll authstatus
 *   3. 用哪个 provider(决定 bind page 走哪个 endpoint)
 *
 * 选 sessionStorage 而非 localStorage:tab 关掉就清,不让用户跨 session 残留。
 * 5 分钟 TTL 跟后端 authcode 过期对齐(`OIDC_AUTHCODE_TTL_MS`)。
 */

export interface PendingOidcLogin {
  providerId: string;
  authcode: string;
  savedAt: number;
}

const STORAGE_KEY = "pending_oidc_login";

export function savePendingOidcLogin(value: PendingOidcLogin): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

function isPendingOidcLogin(value: unknown): value is PendingOidcLogin {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.providerId === "string" &&
    v.providerId !== "" &&
    typeof v.authcode === "string" &&
    v.authcode !== "" &&
    typeof v.savedAt === "number" &&
    Number.isFinite(v.savedAt)
  );
}

export function getPendingOidcLogin(): PendingOidcLogin | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return isPendingOidcLogin(parsed) ? parsed : null;
}

export function clearPendingOidcLogin(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(STORAGE_KEY);
}

export function isPendingExpired(pending: PendingOidcLogin, now: number = Date.now()): boolean {
  return now - pending.savedAt >= OIDC_AUTHCODE_TTL_MS;
}
