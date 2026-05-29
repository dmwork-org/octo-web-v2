# REFERENCE — implement-route-with-query-loader

## 源追溯

示范代码的 canonical pattern 来自 TanStack 官方文档,不是 pilot 项目。

### TanStack Router(主)

- [Overview](https://tanstack.com/router/latest/docs/overview) — feature enumeration
- [External Data Loading guide](https://tanstack.com/router/latest/docs/framework/react/guide/external-data-loading) — **canonical 模式来源**
- [TanStack Query Integration](https://tanstack.com/router/latest/docs/framework/react/integrations/query)

### TanStack Query(辅)

- [Overview](https://tanstack.com/query/latest/docs/framework/react/overview)
- [`queryOptions` API](https://tanstack.com/query/latest/docs/framework/react/reference/queryOptions)
- [`useSuspenseQuery` API](https://tanstack.com/query/latest/docs/framework/react/reference/useSuspenseQuery)
- [`ensureQueryData` on QueryClient](https://tanstack.com/query/latest/docs/reference/QueryClient#queryclientensurequerydata)

## 版本锁

| 包                       | 版本                                         | 最后验证日期 |
| ------------------------ | -------------------------------------------- | ------------ |
| `@tanstack/react-router` | v1.x(file-based,`createFileRoute` API)       | 2026-04-23   |
| `@tanstack/react-query`  | v5.x(`queryOptions` factory API 从 v5.17 起) | 2026-04-23   |

## 升级检查清单

当 Router 或 Query 大版本升级时,**必须**重跑:

- [ ] `example-basic.tsx` 能 `vp check` 通过
- [ ] SKILL.md 中的 API 名称仍是官方推荐(如 `createFileRoute` 没改名)
- [ ] `ensureQueryData` / `useSuspenseQuery` 的行为契约未变
- [ ] eval `a1-no-useeffect-fetch` 对新版仍 pass

## 备注

- 本 skill 不依赖 `tanstack-router-plugin`(build-time code gen)或手写 routeTree — 都走 file-based 约定
- 若 pilot 项目 router 上下文 `queryClient` 注入方式不同(如全局 import),在 Step 5 Combine 时调整示范,保留模式不变
