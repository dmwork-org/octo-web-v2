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
  (store: Store<SpaceState>) =>
  ({ options }: FetchContext) => {
    const spaceId = store.state.spaceId;
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
