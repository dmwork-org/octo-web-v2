---
name: implement-mutation-with-invalidate
description: Implement a TanStack Query useMutation hook factory that calls an ofetch endpoint and invalidates related queries on success via the queryKey factory. Use when creating files src/features/**/mutations.ts — POST/PUT/PATCH/DELETE endpoints, optimistic updates, error rollback. Combines useMutation + queryClient.invalidateQueries with keys imported from queryOptions factory (no string concatenation). Prevents stale-cache UI after writes and accidental setQueryData persistence. Keywords useMutation, mutationFn, onSuccess, invalidateQueries, queryKey factory, mutation hook, optimistic update, rollback.
paths:
  - src/features/**/mutations.ts
metadata:
  owner: octo-web
  version: "1.0"
  stack: react+tanstack-query+ofetch
---

# Implement Mutation with Invalidate

## When to use

触发场景:

- 新建 `src/features/<domain>/mutations.ts`
- 任何"写完要刷列表 / 详情"的场景:创建 / 编辑 / 删除 Matter、加联系人、发消息、改 bot 配置等
- 需要乐观更新 + 失败回滚的写操作

**不适用**:

- 读数据 → 用 [`implement-route-with-query-loader`](../implement-route-with-query-loader/SKILL.md)
- 表单 UI 状态 → 用 `implement-form`(待建)
- HTTP 客户端拦截器 → 用 [`implement-ofetch-interceptor`](../implement-ofetch-interceptor/SKILL.md)

## How(核心 4 步)

### 1. queryKey 从 factory 取(**必须**,禁止拼字符串)

依赖已有的 `src/features/<domain>/queries.ts` factory(由 `implement-route-with-query-loader` 落地):

```ts
// src/features/todo/queries.ts(已存在)
export const matterQueries = {
  all: () =>
    queryOptions({
      queryKey: ["matters"] as const,
      queryFn: () => todoEndpoints.list(),
    }),
  byId: (id: string) =>
    queryOptions({
      queryKey: ["matters", id] as const,
      queryFn: () => todoEndpoints.byId(id),
    }),
};
```

Mutation 文件**只 import 这些工厂的 `queryKey`**,不要新建一份 key:

```ts
// src/features/todo/mutations.ts
import { matterQueries } from "./queries";

const allKey = matterQueries.all().queryKey; // ✅
const allKey2 = ["matters"] as const; // ❌ 拼字符串会与 factory 脱节
```

### 2. mutation hook 工厂(**必须**,每个写操作一个 hook)

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { todoEndpoints } from "@/features/base/api/endpoints/todo";
import type { Matter } from "@/features/todo/types";
import { matterQueries } from "./queries";

export const useCreateMatter = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Pick<Matter, "title" | "ownerId">) => todoEndpoints.create(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: matterQueries.all().queryKey,
      });
    },
  });
};

export const useUpdateMatter = (id: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Matter>) => todoEndpoints.update(id, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: matterQueries.all().queryKey,
      });
      void queryClient.invalidateQueries({
        queryKey: matterQueries.byId(id).queryKey,
      });
    },
  });
};
```

- 每个写操作一个 hook,不要把 create / update / delete 塞同一个 `useMutation`
- `useMutation` 返回 `{ mutate, mutateAsync, isPending, error }` — 组件按需取
- `onError` 默认不写 — ofetch 拦截器已 toast(见 [`implement-ofetch-interceptor`](../implement-ofetch-interceptor/SKILL.md))

### 3. 乐观更新 + 回滚(只在"等不起 200ms"的场景用)

```ts
export const useToggleMatterDone = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) => todoEndpoints.update(id, { done }),
    onMutate: async ({ id, done }) => {
      const key = matterQueries.byId(id).queryKey;
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData<Matter>(key);
      queryClient.setQueryData<Matter>(key, (old) => (old ? { ...old, done } : old));
      return { prev, key };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx) queryClient.setQueryData(ctx.key, ctx.prev);
    },
    onSettled: (_data, _err, { id }) => {
      void queryClient.invalidateQueries({
        queryKey: matterQueries.byId(id).queryKey,
      });
    },
  });
};
```

- `onMutate` 必须先 `cancelQueries`(防 in-flight 拉回覆盖乐观值)
- ctx 必须包含 `prev` 供回滚
- `onSettled`(成功失败都跑)做最终 invalidate,与服务端对齐

### 4. 组件调用站点

```tsx
function QuickAdd() {
  const create = useCreateMatter();
  return (
    <button
      disabled={create.isPending}
      onClick={() => create.mutate({ title: "new", ownerId: "me" })}
    >
      {create.isPending ? "saving..." : "add"}
    </button>
  );
}
```

- 用 `mutate` 不阻塞;需要 await 用 `mutateAsync`
- loading 状态读 `isPending`,**不要**再写 `useState(false)` 维护

## 禁忌

- ❌ queryKey 拼字符串(`["matters", "all"]` 散落)— 必须从 factory `.queryKey` 取
- ❌ `onSuccess` 里 `setQueryData(newList)` 当持久化(应 `invalidateQueries`,服务端为准)
- ❌ 多个写操作共用一个 `useMutation` switch(拆 hook)
- ❌ 写 mutation 不 invalidate(列表会显示旧数据,违反 b1-mutation-invalidates rule)
- ❌ 自己维护 `isLoading` useState(用 `isPending`)
- ❌ 在 `onSuccess` 里 toast(交给 ofetch 错误拦截器统一)
- ❌ mutation 与 query 跨 feature 引用(同 feature 内,不要 `import` 别的 feature 的 mutation)

## 完整可运行范本

见 [`example-basic.tsx`](./example-basic.tsx) — create + update + 乐观 toggle 三件套最小骨架。

## 相关 rule / eval

- eval:[`.ai/evals/b1-mutation-invalidates`](../../../.ai/evals/b1-mutation-invalidates/)
- eval:[`.ai/evals/b2-querykey-factory`](../../../.ai/evals/b2-querykey-factory/)

## 源追溯

见 [`references/REFERENCE.md`](./references/REFERENCE.md)。
