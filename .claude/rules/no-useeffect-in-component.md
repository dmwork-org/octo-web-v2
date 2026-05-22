---
paths:
  - "src/**/*.tsx"
---

# 禁止 component 本体出现裸 `useEffect` — 必须抽到命名 `use*` hook

## Why

裸 `useEffect(() => {...})` 把副作用的**意图藏在匿名回调里**,AI / reviewer 无法通过文件检索(grep / symbol search)定位这个 effect 在做什么。把 effect 封装成命名 hook(例:`useSyncSelectionToUrl` / `useScrollRestoration` / `useWebSocketConnection`)后:

- 意图写在函数名,`grep "useSyncSelectionToUrl"` 就能找到所有用的地方
- effect 边界清晰,可独立测试 / mock
- 强迫作者重新问一次 "这真的需要 effect 吗"(对齐 Abramov "You Might Not Need an Effect")

## 反例(禁止)

```tsx
function OrderList() {
  const [selection, setSelection] = useState<string[]>([]);
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("sel", selection.join(","));
    window.history.replaceState(null, "", url);
  }, [selection]);
  return <Table onSelect={setSelection} />;
}
```

## 正例

```tsx
function useSyncSelectionToUrl(selection: string[]) {
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("sel", selection.join(","));
    window.history.replaceState(null, "", url);
  }, [selection]);
}

function OrderList() {
  const [selection, setSelection] = useState<string[]>([]);
  useSyncSelectionToUrl(selection);
  return <Table onSelect={setSelection} />;
}
```

## 例外

**无**(陈超拍板,零例外)。哪怕只用一次,也抽到命名 hook。理由:开例外会出现 "匿名 effect 钻空子" 模式,AI 学到这个口子后大范围绕。

## 机器检

- 规则 ID:`no-useeffect-in-component`
- 实现:`.ai/taste/oxlint-plugin/rules/no-useeffect-in-component.js`(Oxlint JS Plugin,通过 `vp check` 触发)
- 分类(Option C):
  - **hook**:函数名 `/^use[A-Z]/` → useEffect 合法
  - **component**:函数名首字母大写 AND 函数体含 JSX → useEffect 禁止
  - `forwardRef` / `memo` 包裹的匿名 fn 沿用外层 `VariableDeclarator` 的名字

## 和 `no-useeffect-fetch` 的关系

两条规则**正交**,都要遵守:

- 本规则(结构):component 不能有裸 useEffect
- [`no-useeffect-fetch`](./no-useeffect-fetch.md)(语义):任何 useEffect 里不能 fetch/ofetch(即使包进 `useFetchPosts()` 也错,那是 useQuery 的活)

## 参考

- [Dan Abramov — You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect)
- [React Rules of Hooks](https://react.dev/warnings/invalid-hook-call-warning)
