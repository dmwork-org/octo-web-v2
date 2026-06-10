# taste rules — 15 条(2026-05-06 audit,原 18 条砍 3)

> 规则定义的唯一来源。机器实现状态见同目录 `rules.ts`。
>
> **每条规则必须"正-反-例外"三段齐全**，缺一不可。没有例外就写"无"。
>
> **2026-05-06 audit**:砍 `route-nesting-by-data-dep` / `long-list-use-infinitequery` / `component-max-120-lines`(理由见 rules.ts 头部注释);
> severity 调整:`url-state-via-usesearch` warn→error、`route-error-component-required` error→warn、
> `forwardref-has-displayname` error→warn、`async-errors-to-boundary` 迁 workflow、`theme-variables-for-colors` 标 observational

---

## A. TanStack Router

### no-useeffect-in-component — component 本体禁止裸 `useEffect`，必须抽到命名 `use*` hook

**正例**

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

**反例**

```tsx
function OrderList() {
  const [selection, setSelection] = useState<string[]>([]);
  useEffect(() => {
    // 意图完全藏在匿名函数里，AI / reviewer 无法检索
    const url = new URL(window.location.href);
    url.searchParams.set("sel", selection.join(","));
    window.history.replaceState(null, "", url);
  }, [selection]);
}
```

**例外** 无（零例外，项目负责人拍板）。哪怕只用一次，也抽到命名 hook。理由：命名 hook 是 AI 检索 / reviewer 定位意图的唯一入口；开例外就会出现"匿名 effect 钻空子"模式。

**分类（Option C）**：component = 函数名首字母大写 AND 函数体含 JSX；hook = 函数名 `/^use[A-Z]/`。`forwardRef` / `memo` 包裹的匿名 fn 沿用外层 `VariableDeclarator` 的名字。

---

### no-useeffect-fetch — 数据拉取用 `loader`，不用 `useEffect + fetch`

**正例**

```tsx
export const Route = createFileRoute("/posts")({
  loader: () => queryClient.ensureQueryData(postsQuery),
  component: PostsPage,
});
```

**反例**

```tsx
function PostsPage() {
  const [posts, setPosts] = useState([]);
  useEffect(() => {
    fetch("/api/posts")
      .then((r) => r.json())
      .then(setPosts);
  }, []);
}
```

**例外** 无。useEffect 本身应已被 `no-useeffect-in-component` 限制在命名 `use*` hook 内；本规则进一步要求：即使在 hook 内，也不能用 `useEffect + fetch` 的方式拉数据（应走 `useQuery` / `ensureQueryData`）。DOM 事件订阅 / SDK 初始化 / WebSocket 连接等合法 effect 场景，不会出现 fetch 调用。

---

### url-state-via-usesearch — URL 状态用 `useSearch + validateSearch`，不用 `useState`

**正例**

```tsx
export const Route = createFileRoute("/posts")({
  validateSearch: z.object({ page: z.number().default(1) }),
  component: () => {
    const { page } = Route.useSearch();
    return <Pagination page={page} />;
  },
});
```

**反例**

```tsx
function PostsPage() {
  const [page, setPage] = useState(1); // 刷新丢失、不能分享链接
}
```

**例外** 纯 UI 过渡状态（hover / modal open 等短寿命、不需要持久化 / 不需要分享的状态）。判断标准：**用户刷新页面后，这个状态应该还在吗**？应该 → URL；不应该 → useState。

---

### route-error-component-required — 路由必须有 `errorComponent`

**正例**

```tsx
export const Route = createFileRoute("/posts")({
  loader: loadPosts,
  component: PostsPage,
  errorComponent: PostsErrorBoundary,
});
```

**反例**

```tsx
export const Route = createFileRoute("/posts")({
  loader: loadPosts,
  component: PostsPage,
  // 缺 errorComponent，loader throw 时用户看到白屏
});
```

**例外** 纯静态路由（无 loader、无 mutation、无外部副作用），例如 `/about`。

---

### route-nesting-by-data-dep — 路由嵌套反映**数据依赖**,不是 UI 层级 ~~(2026-05-06 audit 删除)~~

~~已删除。理由:判断"UI 套层 vs 数据依赖"需要语义分析,机器化误报高。review 阶段提醒即可。~~

---

### use-filebased-route — 用 `createFileRoute`，不手写 Route 对象

**正例**

```tsx
// src/routes/posts.tsx
export const Route = createFileRoute('/posts')({
  loader: ...,
  component: ...,
});
```

**反例**

```tsx
const postsRoute = new Route({ path: '/posts', ... });
rootRoute.addChildren([postsRoute]);
```

**例外** 无。file-based routing 是团队默认，例外需项目负责人批准加进 canonical。

---

## B. TanStack Query

### mutation-invalidates — mutation 后用 `invalidateQueries`，不手动 refetch

**正例**

```tsx
useMutation({
  mutationFn: createPost,
  onSuccess: () => queryClient.invalidateQueries({ queryKey: postKeys.all }),
});
```

**反例**

```tsx
useMutation({
  mutationFn: createPost,
  onSuccess: () => {
    postsQuery.refetch(); // 不走缓存、无法 dedup
    commentsQuery.refetch();
  },
});
```

**例外** 乐观更新（`onMutate` + `setQueryData`）场景下，成功后仍需 `invalidateQueries` 校准服务端状态，**不能省**。

---

### querykey-via-factory — 复杂 key 用 `queryKey` 工厂函数

**正例**

```ts
export const postKeys = {
  all: ["posts"] as const,
  list: (filters: Filters) => [...postKeys.all, "list", filters] as const,
  detail: (id: string) => [...postKeys.all, "detail", id] as const,
};
```

**反例**

```tsx
useQuery({ queryKey: ['posts', 'list', { page, tag }], ... })
// 散落在组件各处，invalidate 时容易漏
```

**例外** 极其简单、只在单文件出现一次的 key（`['currentUser']`）。一旦跨文件复用或有参数化，立即升工厂。

---

### long-list-use-infinitequery — 长列表用 `useInfiniteQuery` ~~(2026-05-06 audit 删除)~~

~~已删除。理由:无法静态判断"列表多长",原 rules.ts note 自承。review 阶段提醒即可。~~

---

### explicit-staletime — `staleTime` 根据业务设置，不默认 0

**正例**

```tsx
useQuery({
  queryKey: postKeys.detail(id),
  queryFn: () => fetchPost(id),
  staleTime: 30_000, // 显式声明
});
```

**反例**

```tsx
useQuery({ queryKey: ..., queryFn: ... });
// 默认 staleTime: 0，每次 mount 都 refetch
```

**例外** 无。staleTime 必须显式，哪怕就是 `0`（写出来 = 承认"我确实要每次 refetch"）。

---

## D. Stack 通用

### no-any — 禁止 `any` / `as any` / `@ts-ignore`

**正例**

```ts
function parse(input: unknown): Post {
  return PostSchema.parse(input);
}
```

**反例**

```ts
function parse(input: any): Post {
  return input as any;
}
// @ts-ignore
const foo: Foo = someMismatchedValue;
```

**例外** 无。已由 `vp check` (Oxlint + tsc) 强制。此条列出是为了让 CC 在 plan 阶段就不会产生。

---

### at-alias-import — `@/` 路径别名导入

**正例**

```ts
import { Button } from "@/components/ui/button";
import { postKeys } from "@/features/posts/keys";
```

**反例**

```ts
import { Button } from "../../../components/ui/button";
import { postKeys } from "../../posts/keys";
```

**例外** 同目录或兄弟目录（`./foo` / `../foo`）短距离导入。`@/` 只用于跨模块。

> 2026-05-22 第一波 P0:与 shadcn/Vite/tsconfig 三方对齐(三方都用 `@/`),从 `~/` 改为 `@/`。

---

### theme-variables-for-colors — Tailwind v4+ `@theme` 变量优先，不内联颜色

**正例**

```css
@theme {
  --color-brand: oklch(0.6 0.15 250);
}
```

```tsx
<div className="bg-brand text-brand-foreground" />
```

**反例**

```tsx
<div className="bg-[#3b82f6] text-[#ffffff]" />
// 颜色散落、主题切换时失控
```

**例外** 一次性、明确不进设计系统的装饰色（例如节日 banner）。需在 PR 里声明临时性。

---

### extend-shadcn-with-cn-cva — shadcn 扩展用 `cn()` + `cva()`，不 fork 原组件

**正例**

```tsx
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

<Button className={cn(buttonVariants({ variant: "outline" }), "mt-4")} />;
```

**反例** 复制 `components/ui/button.tsx` 到 `components/my-button.tsx` 改几行。

**例外** 确实需要结构性变化（例如加新 slot）—— 此时直接改 `components/ui/button.tsx` 原文件（shadcn 是 copy-in 不是 npm 包，本来就允许改）。

---

### component-max-120-lines — 组件超 120 行必须拆 ~~(2026-05-06 audit 删除)~~

~~已删除。理由:魔数 120 来自 Airbnb,和团队无关;可能和"反过度抽象"哲学冲突。review 阶段按情境判断。~~

---

### forwardref-has-displayname — `forwardRef` 必带 `displayName`

**正例**

```tsx
export const Button = forwardRef<HTMLButtonElement, Props>((props, ref) => {
  return <button ref={ref} {...props} />;
});
Button.displayName = "Button";
```

**反例**

```tsx
export const Button = forwardRef<HTMLButtonElement, Props>((props, ref) => {
  return <button ref={ref} {...props} />;
});
// 缺 displayName，React DevTools 显示 "ForwardRef"
```

**例外** 无。React 19+ 很多场景可以不用 forwardRef（ref 直接作 prop 传），此时规则不适用。但**只要用了** forwardRef，必带 displayName。

---

### async-errors-to-boundary — 异步错误必须 catch 并走统一 error boundary

**正例**

```tsx
useMutation({
  mutationFn: createPost,
  onError: (err) => {
    reportError(err); // 上报
    // mutation 错误自动冒泡到最近的 errorComponent
  },
});
```

**反例**

```tsx
const handleClick = async () => {
  await createPost(); // unhandled rejection
};
```

**例外** 显式、内联的 "不关心失败" 场景（例如埋点上报）—— 此时必须 `.catch(() => {})` 显式 swallow，**不能**裸 await。

---

### fetch-via-ofetch — 网络请求走 `ofetch` 封装

**正例**

```ts
import { api } from "@/lib/api"; // ofetch 实例
const posts = await api("/posts");
```

**反例**

```ts
const res = await fetch("/posts");
const posts = await res.json(); // 错误处理 / 类型 / 拦截器全缺
```

**例外** 无。ofetch 封装是团队统一的错误处理 / 认证 / 重试入口，裸 fetch 绕过所有约定。
