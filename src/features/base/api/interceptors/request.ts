import type { FetchContext } from "ofetch";
import type { Store } from "@tanstack/react-store";
import type { AuthState } from "@/features/base/stores/auth";
import type { SpaceState } from "@/features/base/stores/space";

function ensureHeaders(options: FetchContext["options"]): Headers {
  const headers = new Headers(options.headers as HeadersInit | undefined);
  options.headers = headers;
  return headers;
}

export const withAuthToken =
  (store: Store<AuthState>) =>
  ({ options }: FetchContext) => {
    const token = store.state.token;
    if (!token) return;
    const headers = ensureHeaders(options);
    // 后端 wkhttp 中间件读自定义 `token` header(不接 Authorization: Bearer)。
    // 对照旧项目 packages/dmworkbase/src/Service/APIClient.ts initAxios()。
    headers.set("token", token);
  };

export const withSpaceHeader =
  (spaceStore: Store<SpaceState>, authStore: Store<AuthState>) =>
  ({ options }: FetchContext) => {
    // 无 token(匿名请求,如 /login / /sendcode / /loginuuid)不应带 X-Space-Id —
    // 否则后端会用残留 space 上下文路由匿名请求,导致 500。对齐老仓
    // logout 时清 spaceId 的语义(老仓 logout 之后 spaceIdCallback 返空,
    // interceptor 行 60-65 跳过 header 注入)。
    if (!authStore.state.token) return;
    const spaceId = spaceStore.state.spaceId;
    if (!spaceId) return;
    const headers = ensureHeaders(options);
    headers.set("X-Space-Id", spaceId);
  };

export const withReqId =
  () =>
  ({ options }: FetchContext) => {
    const headers = ensureHeaders(options);
    headers.set("X-Request-Id", crypto.randomUUID());
  };
