# REFERENCE — implement-typed-search-params

## 源追溯

示范代码的 canonical pattern 来自 TanStack Router 官方 search-params 指南 + zod schema 标准用法,非 pilot 项目代码。

### TanStack Router(主)

- [Search Params guide](https://tanstack.com/router/latest/docs/framework/react/guide/search-params) — `validateSearch` 全套范式
- [`useSearch` hook](https://tanstack.com/router/latest/docs/framework/react/api/router/useSearchHook)
- [`Route.useNavigate` & search reducer](https://tanstack.com/router/latest/docs/framework/react/guide/navigation#search-param-navigation)
- [`Link search` prop](https://tanstack.com/router/latest/docs/framework/react/api/router/linkComponent)
- [Loader deps from search](https://tanstack.com/router/latest/docs/framework/react/guide/data-loading#using-loaderdeps-to-access-search-params)

### Zod(辅)

- [`z.coerce`](https://zod.dev/?id=coercion-for-primitives) — URL string → number 自动转换
- [`z.enum`](https://zod.dev/?id=zod-enums) — tab / status / sort 等枚举值
- [`.default()`](https://zod.dev/?id=default) — schema 层面声明默认值,组件零兜底

## 版本锁

| 包                       | 版本                              | 最后验证日期 |
| ------------------------ | --------------------------------- | ------------ |
| `@tanstack/react-router` | v1.x(`validateSearch` API 稳定)   | 2026-05-23   |
| `zod`                    | v3+ / v4+(`coerce` / `enum` 兼容) | 2026-05-23   |

## 升级检查清单

Router / zod 大版本升级必须重跑:

- [ ] `example-list-filter.tsx` 能 `vp check` 通过
- [ ] `validateSearch` 接受 zod schema 不需 adapter
- [ ] `Route.useSearch()` 返回类型仍准确
- [ ] `navigate({ search: prev => ... })` 接受 reducer 形式
- [ ] eval `eval-typed-search-params-coverage`(待建)对新版仍 pass

## 设计取舍

- **为什么 zod 而非自写 parser**:zod schema 自带类型推断 + 运行时校验,一处声明双向收益(`z.infer` 出类型 + `parse` 校验非法值)。
- **为什么 `Route.useSearch()` 而非全局 `useSearch()`**:`Route.useSearch()` 类型自动绑当前 route 的 schema,无需手动指定泛型;全局 `useSearch()` 需 `from: '/path'` 显式标记。
- **为什么 reducer 形式更新 search**:URL 参数是叠加状态,完整对象覆盖会丢失未列出字段(e.g. 改 `page` 不动 `status/sort/q`)。`(prev) => ({ ...prev, ...patch })` 是标准做法。
- **为什么 `default()` 写在 schema 而非组件**:schema 是单一事实源 — 改默认值只改一处;否则每个消费组件都要 `??` 兜底,容易不一致(`status ?? "all"` vs `status ?? "open"`)。
- **为什么不放敏感数据**:URL 会被浏览器历史、referrer、CDN 日志、分析工具(GA、Sentry breadcrumb)收走,token / 个人信息进 URL 等于明文泄漏。
- **不放 short-lived UI 态**:hover、dropdown open、动画 flag 进 URL 会产生大量无意义 history entry,后退键体验变差;`useState` 才是正解。

## 备注

- 旧项目 `octo-web` 大量用 `useState` + `useEffect(sync to URL)` 模式 — 迁移时识别"过滤/分页/搜索/tab 选中"四类,直接搬到 `validateSearch` 体系。
- `loaderDeps: ({ search }) => search` 让 route loader 能感知 search 变化(从 schema 派生 queryKey 的关键)。配合 `implement-route-with-query-loader`,过滤切换自动触发新 fetch、缓存按 search 维度命中。
- TanStack Router 的 search serialization 默认走 JSON-encode(对象/数组也能放 URL),但人可读性差;建议 search 字段类型保持 primitive(`string | number | boolean | enum`)。
