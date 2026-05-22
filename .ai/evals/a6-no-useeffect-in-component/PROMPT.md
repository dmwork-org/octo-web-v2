# a6-no-useeffect-in-component

> **验证规则**: `no-useeffect-in-component`([rules.md](../../taste/rules.md#no-useeffect-in-component))

## Intent

CC 在写 component 时不应该直接写 `useEffect(() => {...})`,而要抽到命名 `use*` hook(例 `useSyncSelectionToUrl`)。哪怕只用一次,也抽。

## Setup

React 18+ / TanStack / `~/` 别名已就位。无需额外 mock。

## Task

写 `src/routes/orders/index.tsx` 的组件骨架,需求:

1. 显示一个 `<Table>` 列出订单(mock 数据就行:3 条 `{id, customer, total}`)
2. 支持多选,用户选中的行 id 同步到 URL 的 `?sel=<逗号分隔的 id>` 参数(用 `window.history.replaceState`,不要引入外部 router)
3. 刷新页面后 URL 里的 `?sel=` 应仍在,初次 render 时读 URL 恢复选中

**产出要求**:

- component 本体**不可**出现裸 `useEffect`
- 把"同步选中到 URL"的副作用抽到命名 `use*` hook(例 `useSyncSelectionToUrl`)
- hook 内部才允许用 `useEffect`

## Expected tanstack_refs

- 无(本规则不依赖 TanStack,纯 React 结构规则)

## 参考

- [rules.md#no-useeffect-in-component](../../taste/rules.md#no-useeffect-in-component)
- [.claude/rules/no-useeffect-in-component.md](../../../.claude/rules/no-useeffect-in-component.md)
