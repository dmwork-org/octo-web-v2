---
name: implement-typed-search-params
description: Define and consume URL search parameters with type-safety in TanStack Router file-based routes. Use when adding routes that read query string state — list filters, pagination, search input, tab selection, redirect after login. Combines `validateSearch` (zod schema) + `Route.useSearch()` + typed `navigate({ search })` with partial updates. Prevents stringly-typed URL parsing, useState shadowing URL state, and unvalidated query input flowing into components. Keywords search params, validateSearch, useSearch, URL state, query string, zod schema, pagination, filters, navigate search update.
paths:
  - src/routes/**/*.tsx
metadata:
  owner: octo-web
  version: "1.0"
  stack: react+tanstack-router+zod
---

# Implement Typed Search Params

## When to use

触发场景:**任何会出现在 URL 里的状态**

- 列表过滤 / 排序 / 分页(`/_auth/matter?status=open&sort=-due&page=2`)
- 搜索框输入(`/_auth/contacts?q=alice`)
- Tab 选择(`/_auth/summary?tab=schedules`)
- 弹窗 / Drawer 路由化(`/_auth/matter?detail=mt_123`)
- 登录回跳(`/login?redirect=/contacts`)
- 任何"刷新后要保留" / "可分享给同事" / "可后退" 的状态

**不适用**:

- 服务端数据 → [`implement-route-with-query-loader`](../implement-route-with-query-loader/SKILL.md)
- 表单输入中(未提交) → 组件 `useState`(提交后再 push 到 URL)
- hover / open / 一次性动画 → 组件 `useState`
- 跨页面的全局状态(token、当前 spaceId) → TanStack Store(见 [`features/base/stores/`](../../../src/features/base/stores))

判断口诀:**刷新后丢了会糟糕的,放 URL search;无所谓的,放 useState。**

## How(核心 4 步)

### 1. 定义 zod schema(**必须**,不允许 `Record<string, string>` 兜底)

```tsx
import { z } from "zod";

const matterSearchSchema = z.object({
  status: z.enum(["all", "open", "doing", "done"]).default("all"),
  sort: z.enum(["due_asc", "due_desc", "created_desc"]).default("created_desc"),
  page: z.coerce.number().int().min(1).default(1),
  q: z.string().optional(),
});

type MatterSearch = z.infer<typeof matterSearchSchema>;
```

- `z.coerce.number()` 自动把 URL string `"2"` 转 number
- `default(...)` 让 schema 解析时缺失字段自动填默认值 — 组件读 `search.page` 总是有值
- `optional()` 用于"无值就别出现在 URL"的字段(`q=` 比 `q=undefined` 干净)

### 2. route 用 `validateSearch` 注册(**必须**)

```tsx
export const Route = createFileRoute("/_auth/matter")({
  validateSearch: matterSearchSchema,
  component: MatterView,
});
```

- 类型自动流到 `useSearch()` 返回值,无需手动 narrow
- 非法值(如 `?page=abc`)在 router 层 throw,被 errorComponent 接住,不会污染组件

### 3. 组件用 `Route.useSearch()` 消费(**必须**,不允许 `new URLSearchParams(location.search)`)

```tsx
import { Route } from "./_auth.matter";

function MatterView() {
  const { status, sort, page, q } = Route.useSearch();
  const navigate = Route.useNavigate();

  // 拿 search 当 queryKey 的一部分,Query 自动按 URL 维度缓存
  const matters = useSuspenseQuery(matterQueries.list({ status, sort, page, q }));

  return (
    <MatterList
      data={matters.data}
      onFilterChange={(next) => {
        void navigate({ search: (prev) => ({ ...prev, ...next, page: 1 }) });
      }}
    />
  );
}
```

- `Route.useSearch()` 返回类型完整,IDE 自动补全 + 改 schema 编译期发现所有引用
- 不要 `useNavigate()` + 手动拼字符串;用 `Route.useNavigate()` 拿 typed 版本

### 4. 改 search 用 reducer 形式(**必须**,部分更新别覆盖)

```tsx
// ✅ 改 page,保留其他参数
navigate({ search: (prev) => ({ ...prev, page: prev.page + 1 }) });

// ✅ 切 tab,顺手把 page 归零
navigate({ search: (prev) => ({ ...prev, tab: "schedules", page: 1 }) });

// ❌ 直接传对象会覆盖未列出的参数
navigate({ search: { page: 2 } }); // status/sort/q 全没了
```

- 一个例外:**重置全部** 时直接传对象,但要显式写完整 default `navigate({ search: { status: "all", sort: "created_desc", page: 1 } })`,不要 `{}`
- `Link to="..." search={...}` 同规则

## 禁忌

- ❌ `useState` 存搜索词/分页/过滤(刷新即丢、分享 URL 状态丢失)
- ❌ `new URLSearchParams(location.search).get('q')` 手动解析(无类型 + 无校验)
- ❌ `validateSearch: (s) => s as Record<string, string>`(放弃 schema 就是放弃保护)
- ❌ 把**短时 UI 态**塞 URL(hover/open/animation flag → 该用 useState)
- ❌ 把**敏感数据**塞 URL search(token、个人信息、session id → URL 会被日志/分析工具收走)
- ❌ search schema 字段直接 `z.string()` 不带 default + 在组件里 `??` 兜底(default 应在 schema 一处声明)

## 完整可运行范本

见 [`example-list-filter.tsx`](./example-list-filter.tsx) — matter 列表 + 过滤 + 分页 + 搜索框的最小骨架。

真实代码可对照 [`src/routes/login.tsx`](../../../src/routes/login.tsx) 的 `redirect` search param 用法(最小一参数版本)。

## 相关 rule / eval

- rule:[`no-useeffect-in-component`](../../rules/no-useeffect-in-component.md)(避免 useEffect 同步 URL→state)
- eval:`eval-typed-search-params-coverage`(待建,P3 业务起步同期落)

## 源追溯

见 [`references/REFERENCE.md`](./references/REFERENCE.md)。
