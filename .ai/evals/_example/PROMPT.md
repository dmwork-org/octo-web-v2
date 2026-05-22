# \_example-list-with-loader

> **示例 eval（不是真实 case）**。命名 `_example/` 下划线前缀 = 非生产 / 仅展示格式。
> Week 3-4 起由陈超根据 pilot 项目真实场景写真实 eval。

## Intent

验证 CC 写列表路由时，能正确使用 loader 拉数据、避免 `useEffect + fetch`、显式声明 `staleTime`、配 `errorComponent`。

## Setup

假设 pilot 项目已有以下基础设施（真实 eval 会把这部分写进 prompt 附带的 fixture）：

- `~/lib/api.ts` — `ofetch` 实例（`fetch-via-ofetch` 规则）
- `~/features/posts/keys.ts` — `postKeys` 工厂（`querykey-via-factory` 规则）
- `~/components/ui/table.tsx` — shadcn Table 组件

## Task

创建 `src/routes/posts.tsx`，显示 posts 列表：

- 用 file-based route + loader 预取数据（`use-filebased-route` / `no-useeffect-fetch`）
- 加载失败显示 `errorComponent`（`route-error-component-required`）
- `staleTime` 设为 30_000（`explicit-staletime`）
- 组件用 shadcn Table 渲染

## Expected tanstack_refs

CC 在 plan 阶段**应该**列出的 TanStack doc 查询（`plan-lists-tanstack-refs` 规则）：

- `router/createFileRoute`
- `router/loader`
- `query/ensureQueryData`
- `query/useSuspenseQuery`
