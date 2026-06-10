import { Store } from "@tanstack/react-store";
import { spaceActions } from "@/features/base/stores/space";
import { i18n } from "@/lib/i18n/instance";
import { detectLocale, localeStorageKey } from "@/lib/i18n/detect-locale";

export interface AuthUser {
  uid: string;
  name: string;
  username: string;
  app_id?: string;
  short_no?: string;
  zone?: string;
  phone?: string;
  /**
   * SSO 登录提供商 id(对齐上游 86c5837b loginInfo.loginProvider);
   * 普通账号密码登录为 undefined。signOut 时根据此字段决定走 OIDC end_session_url
   * 还是直接本地清。
   */
  login_provider?: string;
}

export interface AuthState {
  token: string | null;
  user: AuthUser | null;
}

const STORAGE_KEY = "octo:auth";

function readPersisted(): AuthState {
  if (typeof window === "undefined") return { token: null, user: null };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { token: null, user: null };
    const parsed = JSON.parse(raw) as { token?: unknown; user?: Partial<AuthUser> };
    const token = typeof parsed.token === "string" ? parsed.token : null;
    const u = parsed.user;
    const user: AuthUser | null =
      u && typeof u === "object"
        ? {
            uid: String(u.uid ?? ""),
            name: String(u.name ?? ""),
            username: String(u.username ?? ""),
            app_id: typeof u.app_id === "string" ? u.app_id : undefined,
            short_no: typeof u.short_no === "string" ? u.short_no : undefined,
            zone: typeof u.zone === "string" ? u.zone : undefined,
            phone: typeof u.phone === "string" ? u.phone : undefined,
            login_provider:
              typeof u.login_provider === "string" ? u.login_provider : undefined,
          }
        : null;
    return { token, user };
  } catch {
    return { token: null, user: null };
  }
}

export const authStore = new Store<AuthState>(readPersisted());

/**
 * 本地清 + 跳 /login(对齐老仓 dmworkbase App.tsx clearLocalLoginState + reload):
 * - 清 auth + space store(防匿名请求残留 X-Space-Id;详见 withSpaceHeader)
 * - 清 locale 偏好(对齐 issue #48):避免 A 用户登出后 B 用户登入继承 A 的语言;清完
 *   用 detectLocale 按浏览器/默认重算,不再 persist 回 localStorage(下次用户登录后
 *   服务端语言会再次设置)
 * - `window.location.replace('/login')` 整页跳,清掉所有 react-query cache + 进行中
 *   refetch,避免 logout 后残留请求拿 401 触发 with401Redirect 给 /login 加 redirect
 *
 * **导出供 logout 模块复用**(不让 oidc/logout.ts 反向 import 本文件造成循环依赖
 * `auth.ts → logout.ts → client.ts → auth.ts` 的 TDZ 错误)。
 */
export function clearLocalAuthAndRedirect(): void {
  authStore.setState(() => ({ token: null, user: null }));
  spaceActions.setSpace(null);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(localeStorageKey);
    } catch {
      // ignore storage errors
    }
    i18n.setLocale(detectLocale(), { persist: false });
    window.location.replace("/login");
  }
}

export const authActions = {
  signIn: (token: string, user: AuthUser) => authStore.setState(() => ({ token, user })),
  /**
   * 登出 — 用户主动触发:
   * - SSO 登录(user.login_provider 非空)→ logoutUserInitiated 走 OIDC end_session_url
   *   (调后端 → 跳 IdP 登出页 → IdP 回源到 /login → main.tsx 兜底再清一次)
   * - 非 SSO / OIDC 调用失败 → fallback 走 clearLocalAuthAndRedirect(同原行为)
   *
   * **dynamic import** logout 模块:避免 auth.ts → oidc/logout.ts → api/client.ts
   * → auth.ts 静态循环导入(client.ts 启动时拿不到 authStore 触发 TDZ ReferenceError
   * "Cannot access 'authStore' before initialization")。
   * 用户点登出是 user-initiated 异步操作,dynamic import 延迟开销可接受。
   *
   * 调用方不需要再自己 navigate /login。SSR 环境下 fallback 只清 store。
   */
  signOut: () => {
    void import("@/features/login/oidc/logout")
      .then(({ logoutUserInitiated }) => logoutUserInitiated(clearLocalAuthAndRedirect))
      .catch(() => clearLocalAuthAndRedirect());
  },
};

export function persistAuth(): void {
  if (typeof window === "undefined") return;
  authStore.subscribe(() => {
    try {
      const { token, user } = authStore.state;
      if (token) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, user }));
      } else {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // ignore storage quota / private mode errors
    }
  });
}
