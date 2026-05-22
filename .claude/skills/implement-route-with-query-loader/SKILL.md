---
name: implement-route-with-query-loader
description: Implement a file-based TanStack Router route that loads server data on navigation via TanStack Query. Use when creating a route under src/routes/** that needs to fetch an API collection or entity. Combines createFileRoute + loader calling queryClient.ensureQueryData + queryOptions factory + component reading via useSuspenseQuery. Prevents useEffect+fetch waterfall and loading-state flash. Keywords route loader, ensureQueryData, useSuspenseQuery, file-based route, list page, detail page, server data fetching, TanStack Query integration.
paths:
  - src/routes/**/*.tsx
metadata:
  owner: miaoa-fe-harness
  version: "1.0"
  stack: react+tanstack-router+tanstack-query
---

# Implement Route with Query Loader

## When to use

触发场景:

- 新建 `src/routes/**/*.tsx` 且**需要从 API 拉数据**
- 列表页(posts/、orders/、users/)
- 详情页(posts/$id、orders/$id)
- 任何"进路由就要有数据"的场景

**不适用**:

- 纯展示页(无远程数据) → 普通 React 组件即可
- 需要写数据(POST/PUT/DELETE) → 用 `implement-mutation-with-invalidation` skill
- 需要 URL 搜索参数 → 配合 `implement-typed-search-params` skill(可同一路由同时用)
- 需要权限守卫 → 配合 `implement-route-auth-guard` skill(可同一路由同时用)

## How(核心 4 步)

### 1. 建 query options factory(**必须**,不允许散落 queryKey)

集中管理 queryKey + queryFn,放 `src/features/<domain>/queries.ts`:

```ts
import { queryOptions } from "@tanstack/react-query";
import { ofetch } from "ofetch";

export const postQueries = {
  all: () =>
    queryOptions({
      queryKey: ["posts"] as const,
      queryFn: () => ofetch<Post[]>("/api/posts"),
    }),
  byId: (id: string) =>
    queryOptions({
      queryKey: ["posts", id] as const,
      queryFn: () => ofetch<Post>(`/api/posts/${id}`),
    }),
};
```

### 2. 路由 loader 调 `ensureQueryData`(**必须**)

```ts
export const Route = createFileRoute("/posts/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(postQueries.all()),
  component: PostsPage,
});
```

- `context.queryClient` 由 router 根上下文注入(见 `src/main.tsx` router context)
- `ensureQueryData` 保证 loader 完成后缓存有数据,组件进入时**立即 hit cache**

### 3. 组件用 `useSuspenseQuery`(**必须**,不允许 `useQuery` 在 loader 搭配下)

```tsx
function PostsPage() {
  const { data } = useSuspenseQuery(postQueries.all());
  return (
    <ul>
      {data.map((p) => (
        <li key={p.id}>{p.title}</li>
      ))}
    </ul>
  );
}
```

- `useSuspenseQuery` 保证 data 非 undefined(TypeScript 层干净)
- `useQuery` 返回 `data | undefined`,必须 narrowing — 在有 loader 的场景是冗余代码

### 4. 详情页用 params 传 id

```ts
export const Route = createFileRoute('/posts/$id')({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(postQueries.byId(params.id)),
  component: PostDetailPage,
})

function PostDetailPage() {
  const { id } = Route.useParams()
  const { data } = useSuspenseQuery(postQueries.byId(id))
  return <article>{data.title}</article>
}
```

## 禁忌

- ❌ `useEffect + fetch`(违反 `no-useeffect-fetch` rule)
- ❌ queryKey 散落在组件里(用 factory 集中)
- ❌ 路由写 `loader` 但组件用 `useQuery`(应用 `useSuspenseQuery`)
- ❌ 裸 `fetch`(用 `ofetch`)

## 完整可运行范本

见 [`example-basic.tsx`](./example-basic.tsx) — 列表页最小骨架。

## 相关 rule / eval

- rule:[`no-useeffect-fetch`](../../rules/no-useeffect-fetch.md)
- eval:[`.ai/evals/a1-no-useeffect-fetch`](../../../.ai/evals/a1-no-useeffect-fetch/)

## 源追溯

见 [`references/REFERENCE.md`](./references/REFERENCE.md)。
