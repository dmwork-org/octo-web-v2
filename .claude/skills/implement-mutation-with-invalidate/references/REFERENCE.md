# REFERENCE — implement-mutation-with-invalidate

## 源追溯

示范代码的 canonical pattern 来自 TanStack Query 官方文档;不是 pilot 项目代码。

### TanStack Query(主)

- [Mutations guide](https://tanstack.com/query/latest/docs/framework/react/guides/mutations) — `useMutation` 完整生命周期
- [Query Invalidation guide](https://tanstack.com/query/latest/docs/framework/react/guides/query-invalidation) — `invalidateQueries` + queryKey 匹配规则
- [Optimistic Updates guide](https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates) — `onMutate` + `onError` 回滚 + `onSettled` 兜底 invalidate 的 canonical 三段式
- [Query Keys guide](https://tanstack.com/query/latest/docs/framework/react/guides/query-keys) — factory 模式推荐
- [`queryOptions` API](https://tanstack.com/query/latest/docs/framework/react/reference/queryOptions) — `.queryKey` 字段可直接被 `invalidateQueries` 消费

### TKDodo 博客(社区共识)

- [Effective React Query Keys](https://tkdodo.eu/blog/effective-react-query-keys) — Tanner Linsley(TanStack 作者)推荐的 query key factory 模式

## 版本锁

| 包                      | 版本                                                         | 最后验证日期 |
| ----------------------- | ------------------------------------------------------------ | ------------ |
| `@tanstack/react-query` | v5.x(`isPending` 替代 v4 的 `isLoading`;`onMutate` ctx 透传) | 2026-05-22   |
| `ofetch`                | v1.4+(`method: "POST" / "PATCH"` + `body` 自动 JSON 序列化)  | 2026-05-22   |

## 升级检查清单

当 TanStack Query 大版本升级时,**必须**重跑:

- [ ] `example-basic.tsx` 能 `vp check` 通过
- [ ] `useMutation` 返回值仍包含 `mutate / mutateAsync / isPending`
- [ ] `invalidateQueries({ queryKey })` 仍支持只 partial-match prefix
- [ ] `onMutate` 返回值仍可在 `onError` / `onSettled` ctx 取
- [ ] `queryOptions(...).queryKey` 仍是 `as const` 类型(可被 invalidateQueries 直接吃)
- [ ] eval `b1-mutation-invalidates` / `b2-querykey-factory` 对新版仍 pass

## 设计取舍

- **为什么强制 queryKey 从 factory `.queryKey` 取**:拼字符串 `["matters"]` 与 factory `["matters"] as const` 看起来一样,但 factory 是 SSOT — 改 query key 命名(如 `["matters"]` → `["todo", "matters"]`),所有 invalidate 自动跟上;拼字符串会留死代码,缓存永远不刷新。
- **为什么默认不写 `onError` toast**:错误 toast 是横切关注,放 ofetch `onResponseError` 拦截器一处即可(见 [`implement-ofetch-interceptor`](../implement-ofetch-interceptor/SKILL.md));每个 mutation 单独 toast 会重复 + 不一致。
- **为什么乐观更新单独示范**:大多数 mutation 不需要乐观,等 200-500ms 看 loading 反而清晰;只有"高频交互"(toggle、checkbox、reorder)才需要乐观。default 不上,需要时再加,避免 over-engineering。
- **为什么乐观更新必须 `cancelQueries`**:不取消的话,如果 mutate 触发时正好有 in-flight refetch,refetch 结果会覆盖乐观值,UI 闪一下。
- **为什么 `onSettled` 兜底 invalidate**:乐观更新 + 服务端可能返回比客户端预期更多字段(如 `updatedAt`),不 invalidate 永远显示乐观值;`onSettled` 在成功失败后都跑,确保最终对齐服务端。
- **为什么不用 `setQueryData` 当持久化**:`setQueryData(newList)` 直接改缓存,服务端真实状态(如自动生成的 id / createdAt)拿不到,且别的 tab / 别的 query 看不见这次写入;`invalidateQueries` 触发重拉,所有订阅同步更新。

## 备注

- 旧项目 `octo-web` 用 axios 调 API + 组件内 `useState([])` 维护列表 + 写完手动 `setList([...list, new])`。迁移后:
  1. 列表用 `useSuspenseQuery(matterQueries.all())`,不维护本地 state
  2. 写完只调 `create.mutate(body)`,列表自动刷新
  3. 删除 `useState + setState` 的所有列表数据持有代码
- 旧项目某些场景用 `mittBus.emit('matter/created')` 通知其他组件刷数据 — 迁移后**全部删掉**,改为 mutation `onSuccess: invalidate`,订阅方用 `useSuspenseQuery` 自动收到新数据。
- 删除场景额外注意:删除当前详情后,不要在 detail 路由里 invalidate detail key(已不存在),而是 `navigate({ to: '..' })` 跳回列表后再 invalidate 列表 key。
