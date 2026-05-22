# REFERENCE — implement-auth-guard

## 源追溯

示范代码的 canonical pattern 来自 TanStack 官方文档与 React Router 等价模式;不是 pilot 项目代码。

### TanStack Router(主)

- [Authenticated Routes guide](https://tanstack.com/router/latest/docs/framework/react/guide/authenticated-routes) — `beforeLoad` + `throw redirect` 的 canonical 模式
- [`beforeLoad` API](https://tanstack.com/router/latest/docs/framework/react/api/router/RouteOptionsType#beforeload-method) — 在 loader 之前的同步/异步钩子
- [`redirect` helper](https://tanstack.com/router/latest/docs/framework/react/api/router/redirectFunction)
- [Search params with `validateSearch`](https://tanstack.com/router/latest/docs/framework/react/guide/search-params) — login `redirect` 字段的类型化通道
- [Layout Routes (`_auth` 命名约定)](https://tanstack.com/router/latest/docs/framework/react/guide/route-trees#layout-routes)

### TanStack Store(辅)

- [Store overview](https://tanstack.com/store/latest/docs/overview) — 单例 + 不可变 setState
- [`useStore` selector](https://tanstack.com/store/latest/docs/framework/react/reference/useStore) — selector 缩窄重渲染范围

### Zod(辅)

- `validateSearch` 接受任意 parser;本 skill 选 `zod`(已是 TanStack Router 常见搭档)

## 版本锁

| 包                       | 版本                                                | 最后验证日期 |
| ------------------------ | --------------------------------------------------- | ------------ |
| `@tanstack/react-router` | v1.x(`createFileRoute` + `beforeLoad` + `redirect`) | 2026-05-22   |
| `@tanstack/store`        | v0.7+(`Store` class + `setState` reducer)           | 2026-05-22   |
| `@tanstack/react-store`  | v0.11+(`useStore` selector hook)                    | 2026-05-22   |
| `zod`                    | v3+ / v4+(`validateSearch` 兼容)                    | 2026-05-22   |

## 升级检查清单

当 Router / Store 大版本升级时,**必须**重跑:

- [ ] `example-basic.tsx` 能 `vp check` 通过
- [ ] `beforeLoad` 签名仍接受 `{ location }`
- [ ] `throw redirect({ to, search })` 行为契约未变
- [ ] `Store` 的 `setState` 仍接受 reducer 形式
- [ ] eval `a4-auth-guard-via-beforeload`(待建)对新版仍 pass

## 设计取舍

- **为什么不用 React Context 持 token**:Context 订阅者会全部 re-render;Store + selector(`useStore(s, x => x.token)`)只让消费 token 的组件重渲染。auth 状态全应用读,差距显著。
- **为什么不在每个路由 `beforeLoad` 里检查**:`_auth` layout route 的 `beforeLoad` 对全部子路由生效一次;子路由再写一遍是冗余,且容易漏。
- **为什么 401 拦截器从 ofetch 写**:UI 不参与"被踢"判断,纯靠响应状态码;放拦截器一处即可,业务代码 0 catch 401。
- **为什么 login 用 `validateSearch` 而非读 `window.location.search`**:类型化、可被 router preloading 利用、避免 SSR/CSR hydration 不一致。

## 备注

- 旧项目 `octo-web` 用 `WKApp.loginInfo` 单例 + 命令式 `WKApp.route.replace('/login')`;迁移时把 `WKApp.loginInfo.token` 的所有读点改为 `useStore(authStore, s => s.token)`,把 `WKApp.route.replace` 的所有写点改为 router `navigate`。
- OIDC 回调路由 `routes/login.oidc.callback.tsx` 仍用本 skill 模式:回调成功后 `authActions.signIn(...)` + `navigate({ to: '/' })`;失败 `navigate({ to: '/login', search: { error } })`。
