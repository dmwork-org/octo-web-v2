// ofetch client 最小骨架 — 单例 + 5 个拦截器(authToken / spaceHeader / reqId / 401Redirect / errorToast)
// 来源:ofetch v1.4+ onRequest/onResponseError 数组语法 + TanStack Store 注入
// 见 ./references/REFERENCE.md

import { $fetch, type FetchContext, type FetchOptions, type FetchResponse } from "ofetch";
import { Store } from "@tanstack/store";

// ─── 0. demo stores(实际项目放 src/features/base/stores/*.ts)────────────
const authStore = new Store<{ token: string | null }>({ token: null });
const spaceStore = new Store<{ spaceId: string | null }>({ spaceId: null });
const endpointStore = new Store<{ baseURL: string }>({ baseURL: "/api" });

// ─── 1. request 拦截器(每个一个工厂函数,接 store 注入)─────────────────
const withAuthToken =
  (store: Store<{ token: string | null }>) =>
  ({ options }: FetchContext) => {
    const token = store.state.token;
    if (!token) return;
    options.headers = new Headers(options.headers);
    options.headers.set("Authorization", `Bearer ${token}`);
  };

const withSpaceHeader =
  (store: Store<{ spaceId: string | null }>) =>
  ({ options }: FetchContext) => {
    const spaceId = store.state.spaceId;
    if (!spaceId) return;
    options.headers = new Headers(options.headers);
    options.headers.set("X-Space-Id", spaceId);
  };

const withReqId =
  () =>
  ({ options }: FetchContext) => {
    options.headers = new Headers(options.headers);
    options.headers.set("X-Request-Id", crypto.randomUUID());
  };

// ─── 2. response error 拦截器(401 → 清 store + redirect;其他 → toast)────
const with401Redirect =
  (store: Store<{ token: string | null }>, onRedirect: () => void) =>
  ({ response }: FetchContext & { response: FetchResponse<unknown> }) => {
    if (response.status !== 401) return;
    store.setState(() => ({ token: null }));
    onRedirect();
  };

const withErrorToast =
  (onToast: (msg: string) => void) =>
  ({ response }: FetchContext & { response: FetchResponse<unknown> }) => {
    const msg =
      (response._data as { message?: string } | undefined)?.message ?? response.statusText;
    onToast(msg);
  };

// ─── 3. 单例 api(实际项目导出 export const api)──────────────────────────
export const api = $fetch.create({
  baseURL: endpointStore.state.baseURL,
  onRequest: [withAuthToken(authStore), withSpaceHeader(spaceStore), withReqId()],
  onResponseError: [
    with401Redirect(authStore, () => {
      // 实际项目:router.navigate({ to: "/login", search: { redirect: location.href } })
    }),
    withErrorToast((msg) => {
      // 实际项目:toast.error(msg)
      console.error(msg);
    }),
  ],
} satisfies FetchOptions);
