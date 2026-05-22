# REFERENCE — implement-ofetch-interceptor

## 源追溯

示范代码的 canonical pattern 来自 ofetch 官方 README 与 TanStack Store 集成模式;不是 pilot 项目代码。

### ofetch(主)

- [ofetch README](https://github.com/unjs/ofetch) — `$fetch.create` + interceptors 章节
- [Interceptors 数组语法](https://github.com/unjs/ofetch#%EF%B8%8F-interceptors) — `onRequest` / `onResponse` / `onRequestError` / `onResponseError` 接受**数组**,从 v1.4 起
- [FetchOptions 类型定义](https://github.com/unjs/ofetch/blob/main/src/types.ts)

### TanStack Store(辅)

- [Store overview](https://tanstack.com/store/latest/docs/overview) — `store.state.x` 读取 + `subscribe` 通知

### TanStack Router(辅)

- [Router instance navigate](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterType#navigate-method) — 401 拦截器在组件外用单例 `router.navigate`

## 版本锁

| 包                       | 版本                                          | 最后验证日期 |
| ------------------------ | --------------------------------------------- | ------------ |
| `ofetch`                 | v1.4+(`onRequest`/`onResponseError` 接受数组) | 2026-05-22   |
| `@tanstack/store`        | v0.7+(`Store.state` + `setState` reducer)     | 2026-05-22   |
| `@tanstack/react-router` | v1.x(`router.navigate` 单例方法)              | 2026-05-22   |

## 升级检查清单

当 ofetch 大版本升级时,**必须**重跑:

- [ ] `example-basic.ts` 能 `vp check` 通过
- [ ] `onRequest` 仍接受数组形式(不退化到只允许单个函数)
- [ ] `FetchContext` 的 `options.headers` 仍可被 `new Headers()` 包装
- [ ] `FetchContext & { response }` 的 `response._data` 仍存在(后端错误体读取依赖此字段)
- [ ] eval `d8-fetch-via-ofetch` 对新版仍 pass

## 设计取舍

- **为什么拦截器是工厂函数注入 store**:拦截器若直接 `import { authStore }`,单测必须 mock 整个模块;工厂注入后,直接 `withAuthToken(new Store({ token: 'x' }))` 即可,测试零 mock。
- **为什么 5 个拦截器拆 5 个文件**:每个拦截器是一个横切关注(auth / tenant / trace / 401 / toast),职责分离便于独立演进;改 toast 格式不动 auth 逻辑。
- **为什么用 `new Headers()` 包装 `options.headers`**:ofetch 的 `options.headers` 类型是 `HeadersInit | undefined`(可能是 plain object / Headers / [string, string][]),统一 `new Headers(...)` 拿到稳定 API。
- **为什么不在 onResponse 做信封脱壳**:大多数后端返回 `{code, data, message}`,看起来想脱壳到 `data`;但脱壳会丢失类型(`response._data` 是 `T`,脱完成 `T['data']`,泛型推导噪音大)。让 endpoint 函数显式取 `(await api(...)).data` 反而清晰。本 skill 不脱壳。
- **为什么切租户用 `queryClient.clear()` 而非 `invalidateQueries`**:invalidate 是"标脏 + 下次访问时重拉",标脏后用户若回到上个页面,会先看到旧租户数据再被覆盖。`clear` 直接擦缓存,新租户进入立即触发 loading,语义干净。

## 备注

- 旧项目 `octo-web` 的 `APIClient`(`packages/dmworkbase/src/Service/APIClient.ts`)是 Axios + `axios.interceptors.request.use`,带 token 刷新 + loading 计数 + 错误码 toast 多个职责耦合在一个文件。迁移时按 5 个拦截器拆开,**loading 计数全部删掉** — Query 的 `isFetching` 已经能告诉 UI 有没有 in-flight 请求。
- refreshToken 拦截器本骨架未含(P0 单独迁,语义更复杂:需要 single-flight + 排队等待),触发本 skill 时若涉及 refresh,提示用户拆 `withRefreshToken` 独立文件。
- 旧项目还有动态 baseURL(`EndpointManager`),迁移后由 `endpointStore` 驱动 — `endpointStore.subscribe` 时**重建 api 实例**或 ofetch 支持运行时改 `baseURL`(目前 ofetch 不支持运行时改,只能重建)。骨架未演示,P0 实施时单独处理。
