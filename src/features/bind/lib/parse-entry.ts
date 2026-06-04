/**
 * BindPage URL 入口参数解析 + 地址栏清理(对齐老仓 dmworklogin/src/oidc/bind/url.ts)。
 *
 * **Token 安全规则**(老仓 PR#73 §2.1):
 * - `token` 是凭据,等同一次密码登录会话
 * - 必填,缺则 link invalid
 * - 拿到后立即 `clearBindUrl()` 清地址栏
 * - 不要写入 store / log / telemetry,仅 useRef 持有
 *
 * **sanitizeReturnTo**:return_to 三重防御(防 origin 绕过 / 双斜杠 / 反斜杠注入)。
 *
 * **clearBindUrl**:只清 bind 专属参数,保留 sid 等其他 host-level 参数。
 */

export interface BindEntryParams {
  token: string;
  authcode: string;
  returnTo: string;
  provider?: string;
}

const DEFAULT_RETURN_TO = "/";

export function parseBindEntryParams(search: string): BindEntryParams | null {
  const normalized = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(normalized);
  const token = params.get("token") ?? "";
  const authcode = params.get("authcode") ?? "";
  const rawReturnTo = params.get("return_to") ?? "";
  const provider = params.get("provider") ?? undefined;

  if (token === "") return null;

  const returnTo = sanitizeReturnTo(rawReturnTo);
  return provider !== undefined
    ? { token, authcode, returnTo, provider }
    : { token, authcode, returnTo };
}

export function sanitizeReturnTo(
  value: string,
  pageOrigin: string = typeof window !== "undefined" ? window.location.origin : "http://localhost",
): string {
  if (typeof value !== "string" || value.length < 1) return DEFAULT_RETURN_TO;
  // (1) 反斜杠 / URL-encoded 反斜杠 — 任意位置出现都拒(浏览器把 `\` 当 `/` 会跨域)
  if (/\\|%5[cC]/.test(value)) return DEFAULT_RETURN_TO;
  // (2) 必须站内相对路径起点
  if (!value.startsWith("/") || value.startsWith("//")) return DEFAULT_RETURN_TO;
  // (3) URL 解析后 origin 必须等于本页
  try {
    const parsed = new URL(value, pageOrigin);
    if (parsed.origin !== pageOrigin) return DEFAULT_RETURN_TO;
  } catch {
    return DEFAULT_RETURN_TO;
  }
  return value;
}

const BIND_QUERY_KEYS: ReadonlySet<string> = new Set([
  "token",
  "authcode",
  "return_to",
  "provider",
]);

/**
 * 清地址栏 bind 参数(保留其他 query 如 sid)。
 * - browser 历史不留 token
 * - 截图 / Referer 不带 token
 */
export function clearBindUrl(win: Pick<Window, "history" | "location"> = window): void {
  try {
    const params = new URLSearchParams(win.location.search);
    let mutated = false;
    for (const key of BIND_QUERY_KEYS) {
      if (params.has(key)) {
        params.delete(key);
        mutated = true;
      }
    }
    if (!mutated) return;
    const remaining = params.toString();
    const nextUrl = win.location.pathname + (remaining ? `?${remaining}` : "");
    win.history.replaceState({}, "", nextUrl);
  } catch {
    // SSR / legacy host
  }
}
