import { Store } from "@tanstack/react-store";
import { spaceActions } from "@/features/base/stores/space";

export interface AuthUser {
  uid: string;
  name: string;
  username: string;
  app_id?: string;
  short_no?: string;
  zone?: string;
  phone?: string;
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
          }
        : null;
    return { token, user };
  } catch {
    return { token: null, user: null };
  }
}

export const authStore = new Store<AuthState>(readPersisted());

export const authActions = {
  signIn: (token: string, user: AuthUser) => authStore.setState(() => ({ token, user })),
  /**
   * 登出 — 对齐老仓 dmworkbase App.tsx logout 行为(整页跳 + 清状态):
   * 1. 清 auth + space(防匿名请求残留 X-Space-Id;详见 withSpaceHeader)
   * 2. `window.location.replace('/login')` 整页跳,清掉所有 react-query
   *    cache + 进行中的 refetch,避免 logout 后残留请求拿 401 触发
   *    `with401Redirect` 给 /login 加 `?redirect=<刚才的页面>`(用户主动
   *    登出不应该带 redirect)
   *
   * 调用方不需要再自己 navigate /login。SSR 环境下 fallback 只清 store。
   */
  signOut: () => {
    authStore.setState(() => ({ token: null, user: null }));
    spaceActions.setSpace(null);
    if (typeof window !== "undefined") {
      window.location.replace("/login");
    }
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
