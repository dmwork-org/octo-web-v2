---
paths:
  - "src/**/*.ts"
  - "src/**/*.tsx"
---

# 禁止 `useEffect + fetch` — 用 `loader` 或 `useQuery`

## Why

`useEffect + fetch` 有 5 个常见坑:竞态 / waterfall / 错误处理缺失 / SSR 不友好 / 取消逻辑缺失。
TanStack Router 的 `loader` + TanStack Query 的 `ensureQueryData` 天生解决以上全部。

## 反例(禁止)

```tsx
// ❌ 不要这样写
function OrderList() {
  const [orders, setOrders] = useState([])
  useEffect(() => {
    fetch('/api/orders').then(r => r.json()).then(setOrders)
  }, [])
  return <ul>{orders.map(...)}</ul>
}
```

## 正例

```tsx
// ✅ Router loader + Query
export const Route = createFileRoute('/orders/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(orderQueries.list()),
  component: OrderList,
})

function OrderList() {
  const { data } = useSuspenseQuery(orderQueries.list())
  return <ul>{data.map(...)}</ul>
}
```

## 例外

无。useEffect 本身应已被 [`no-useeffect-in-component`](./no-useeffect-in-component.md) 限制在命名 `use*` hook 内;本规则进一步要求:即使在 hook 内,也不能用 `useEffect + fetch` 的方式拉数据(应走 `useQuery` / `ensureQueryData`)。DOM 事件订阅 / SDK 初始化 / WebSocket 连接等合法 effect 场景,不会出现 fetch 调用。

## 机器检(B11 taste-lint 覆盖)

- 规则 ID:`no-useeffect-fetch`
- AST 匹配:`useEffect` 回调函数体内出现 `fetch(` 或 `ofetch(` 或 `.then(`

## 参考

- [TanStack Router Data Loading](https://tanstack.com/router/latest/docs/framework/react/guide/data-loading)
- [TanStack Query ensureQueryData](https://tanstack.com/query/latest/docs/reference/QueryClient#queryclientensurequerydata)
