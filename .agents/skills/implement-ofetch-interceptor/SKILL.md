---
name: implement-ofetch-interceptor
description: Implement a project-wide ofetch HTTP client with composable request/response interceptors. Use when creating or modifying files under src/features/base/api/** — the singleton client, auth-token injector, X-Space-Id multi-tenant header, request-id tracing, error toast, 401 refresh/redirect. Each interceptor is an independent pure function composed into one $fetch.create() instance. Prevents Axios-style mutable interceptors.use() and ad-hoc header plumbing in queryFn. Keywords ofetch, $fetch.create, onRequest, onResponse, onResponseError, interceptor chain, auth token, X-Space-Id, request-id, error toast.
paths:
  - src/features/base/api/**
  - src/lib/api.ts
metadata:
  owner: octo-web
  version: "1.0"
  stack: ofetch+tanstack-store
---

# Implement ofetch Interceptor

## When to use

触发场景:

- 新建/修改 `src/features/base/api/client.ts`(项目唯一 HTTP 客户端单例)
- 加新的横切关注(新 header / 新 trace 字段 / 新错误处理)
- 把旧项目 `WKApp.apiClient`(Axios + `interceptors.use`)迁过来

**不适用**:

- 业务 queryFn / mutationFn → 直接 `import { api } from "@/features/base/api/client"`,本 skill 不覆盖
- 加新 endpoint → `src/features/base/api/endpoints/<domain>.ts`,只是调 `api()`,不动 client
- Mock / 测试桩 → `vi.mock("@/features/base/api/client")`,不在本 skill 范围

## How(核心 5 步)

### 1. 单例 + 工厂参数(**必须**,拦截器不依赖直接 store import)

`src/features/base/api/client.ts`:

```ts
import { $fetch, type FetchOptions } from "ofetch";
import { authStore } from "@/features/base/stores/auth";
import { spaceStore } from "@/features/base/stores/space";
import { endpointStore } from "@/features/base/stores/endpoint";
import { withAuthToken, withSpaceHeader, withReqId } from "./interceptors/request";
import { withErrorToast, with401Redirect } from "./interceptors/response";

export const api = $fetch.create({
  baseURL: endpointStore.state.baseURL,
  onRequest: [withAuthToken(authStore), withSpaceHeader(spaceStore), withReqId()],
  onResponseError: [with401Redirect(authStore), withErrorToast()],
} satisfies FetchOptions);
```

- 拦截器是**工厂函数**接受 store 参数,返回 `onRequest` 兼容签名 — 便于单测
- `onRequest` / `onResponseError` 接受**数组**(ofetch v1.4+),按顺序执行
- 不要在拦截器内 `import store` — 显式注入,保持可替换

### 2. 拦截器拆 5 个独立纯函数(**必须**,每个一文件)

`src/features/base/api/interceptors/request.ts`:

```ts
import type { FetchContext } from "ofetch";
import type { Store } from "@tanstack/store";

export const withAuthToken =
  (store: Store<{ token: string | null }>) =>
  ({ options }: FetchContext) => {
    const token = store.state.token;
    if (token) {
      options.headers = new Headers(options.headers);
      options.headers.set("Authorization", `Bearer ${token}`);
    }
  };

export const withSpaceHeader =
  (store: Store<{ spaceId: string | null }>) =>
  ({ options }: FetchContext) => {
    const spaceId = store.state.spaceId;
    if (spaceId) {
      options.headers = new Headers(options.headers);
      options.headers.set("X-Space-Id", spaceId);
    }
  };

export const withReqId =
  () =>
  ({ options }: FetchContext) => {
    options.headers = new Headers(options.headers);
    options.headers.set("X-Request-Id", crypto.randomUUID());
  };
```

`src/features/base/api/interceptors/response.ts`:

```ts
import type { FetchContext, FetchResponse } from "ofetch";
import type { Store } from "@tanstack/store";
import { router } from "@/main";
import { toast } from "@/components/semi-bridge/toast";

export const with401Redirect =
  (store: Store<{ token: string | null }>) =>
  ({ response }: FetchContext & { response: FetchResponse<unknown> }) => {
    if (response.status === 401) {
      store.setState(() => ({ token: null }));
      void router.navigate({
        to: "/login",
        search: { redirect: location.href },
      });
    }
  };

export const withErrorToast =
  () =>
  ({ response }: FetchContext & { response: FetchResponse<unknown> }) => {
    const msg =
      (response._data as { message?: string } | undefined)?.message ?? response.statusText;
    toast.error(msg);
  };
```

- 每个拦截器只做一件事,签名一致(`(ctx) => void`)
- 401 拦截器调 `router.navigate`(单例),而不是 hook(拦截器在组件外)
- 错误 toast 从 `_data.message` 取(后端约定);格式变化只改这一处

### 3. Store 变更触发 baseURL / 缓存失效(**必须**)

`src/main.tsx` 入口处订阅一次:

```ts
import { queryClient } from "@/lib/query-client";
import { spaceStore } from "@/features/base/stores/space";
import { endpointStore } from "@/features/base/stores/endpoint";

spaceStore.subscribe(() => queryClient.clear());
endpointStore.subscribe(() => queryClient.clear());
```

- 切租户 / 切环境时**全清缓存**,避免跨租户数据串
- 不要在每个 queryFn 里把 spaceId 拼 queryKey — 全清更可靠

### 4. 类型化 endpoints 调用站点

`src/features/base/api/endpoints/todo.ts`:

```ts
import { api } from "@/features/base/api/client";
import type { Matter } from "@/features/todo/types";

export const todoEndpoints = {
  list: () => api<Matter[]>("/matter/api/v1/matters"),
  byId: (id: string) => api<Matter>(`/matter/api/v1/matters/${id}`),
  create: (body: Pick<Matter, "title" | "ownerId">) =>
    api<Matter>("/matter/api/v1/matters", { method: "POST", body }),
};
```

- 业务层只 import `endpoints`,不 import `api`
- `body` 直接传对象,ofetch 自动 JSON.stringify

### 5. 测试拦截器(**必须**为每个拦截器写单测)

```ts
import { describe, expect, it } from "vitest";
import { Store } from "@tanstack/store";
import { withAuthToken } from "../interceptors/request";

describe("withAuthToken", () => {
  it("sets Authorization header when token present", () => {
    const store = new Store({ token: "abc" });
    const options = { headers: new Headers() };
    withAuthToken(store)({ options } as never);
    expect(options.headers.get("Authorization")).toBe("Bearer abc");
  });
});
```

- 拦截器是纯函数(注入 store),测试不需要 mock 模块

## 禁忌

- ❌ Axios 风格 `client.interceptors.request.use(...)`(用 `onRequest` 数组)
- ❌ 在 queryFn / mutationFn 内手动塞 header
- ❌ 拦截器内直接 `import { authStore }`(用工厂注入,便于单测)
- ❌ 多个 client 实例(全项目唯一 `api`)
- ❌ 用 axios / 裸 fetch(违反 d8-fetch-via-ofetch rule)
- ❌ 401 重定向用 `window.location.href`(走 router `navigate`)
- ❌ 切租户用 invalidateQueries(`queryClient.clear()` 更彻底)

## 完整可运行范本

见 [`example-basic.ts`](./example-basic.ts) — client 单例 + 5 个拦截器全套最小骨架。

## 相关 rule / eval

- rule:[`no-useeffect-fetch`](../../rules/no-useeffect-fetch.md)(拦截器层与 loader 层正交)
- eval:[`.ai/evals/d8-fetch-via-ofetch`](../../../.ai/evals/d8-fetch-via-ofetch/)
- eval:`eval-space-header-injected`(待建,P0 同期落)

## 源追溯

见 [`references/REFERENCE.md`](./references/REFERENCE.md)。
