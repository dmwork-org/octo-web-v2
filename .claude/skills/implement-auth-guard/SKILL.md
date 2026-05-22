---
name: implement-auth-guard
description: Implement auth-protected routes via TanStack Router beforeLoad redirect against a TanStack Store auth singleton. Use when creating layout route src/routes/_auth*, login route src/routes/login*, or any route that must reject unauthenticated users before rendering. Combines beforeLoad + throw redirect + search-param round-trip + TanStack Store token read. Prevents useEffect+navigate flash and per-component guard duplication. Keywords auth guard, beforeLoad, redirect, login, protected route, _auth layout, token check, TanStack Store auth.
paths:
  - src/routes/_auth*
  - src/routes/_auth/**/*.tsx
  - src/routes/login*
  - src/features/base/stores/auth.ts
metadata:
  owner: octo-web
  version: "1.0"
  stack: react+tanstack-router+tanstack-store
---

# Implement Auth Guard

## When to use

触发场景:

- 新建 layout route `src/routes/_auth.tsx`(下挂全部受保护路由)
- 新建公开路由 `src/routes/login.tsx`、`src/routes/login.bind.tsx`、`src/routes/login.oidc.callback.tsx`
- 任何需要"未登录用户进不来"的路由
- 401 响应后强制跳登录的逻辑落点

**不适用**:

- 路由数据拉取 → 用 [`implement-route-with-query-loader`](../implement-route-with-query-loader/SKILL.md)(可同一路由叠加)
- 写数据 → 用 [`implement-mutation-with-invalidate`](../implement-mutation-with-invalidate/SKILL.md)
- 细粒度按钮级权限(`canDelete` 之类) → 组件内读 `useStore(authStore, s => s.permissions)`,本 skill 不覆盖

## How(核心 4 步)

### 1. auth store(**必须**,token 不放 React Context / Provider 链)

`src/features/base/stores/auth.ts`:

```ts
import { Store } from "@tanstack/store";

interface AuthState {
  token: string | null;
  user: { id: string; name: string } | null;
}

export const authStore = new Store<AuthState>({ token: null, user: null });

export const authActions = {
  signIn: (token: string, user: AuthState["user"]) => authStore.setState(() => ({ token, user })),
  signOut: () => authStore.setState(() => ({ token: null, user: null })),
};
```

- `Store` 是单例,模块级持久;不通过 props/context 传递
- `setState` 接受 reducer,**禁止**直接赋值 `authStore.state.token = ...`
- token 落 `localStorage` 由 store 的 `subscribe` 完成(在入口处订阅一次,见 `src/main.tsx`)

### 2. layout route 用 `beforeLoad` 守卫(**必须**,不允许 `useEffect + navigate`)

`src/routes/_auth.tsx`:

```tsx
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { authStore } from "@/features/base/stores/auth";

export const Route = createFileRoute("/_auth")({
  beforeLoad: ({ location }) => {
    if (!authStore.state.token) {
      throw redirect({
        to: "/login",
        search: { redirect: location.href },
      });
    }
  },
  component: AuthLayout,
});

function AuthLayout() {
  return <Outlet />;
}
```

- `beforeLoad` 在 loader 之前跑,**未登录用户根本不会 mount 子树** — 没有 loading flash
- `throw redirect` 是 router 内置控制流,不要 `router.navigate`
- 携带 `search.redirect` 让登录后能跳回原路径

### 3. login 路由消费 `search.redirect` 并切换登录态

`src/routes/login.tsx`:

```tsx
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { authActions } from "@/features/base/stores/auth";
import { loginMutation } from "@/features/login/mutations";

const loginSearchSchema = z.object({ redirect: z.string().optional() });

export const Route = createFileRoute("/login")({
  validateSearch: loginSearchSchema,
  component: LoginPage,
});

function LoginPage() {
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const mutation = loginMutation();

  const onSubmit = async (form: { username: string; password: string }) => {
    const { token, user } = await mutation.mutateAsync(form);
    authActions.signIn(token, user);
    navigate({ to: redirect ?? "/", replace: true });
  };

  return <LoginForm onSubmit={onSubmit} />;
}
```

- `redirect` 通过 `validateSearch` 进入类型系统,不需手动 narrow
- 登录成功后 `replace: true` 避免回退到 `/login`

### 4. 401 拦截器把"被踢"翻译成 redirect

ofetch 拦截器(由 [`implement-ofetch-interceptor`](../implement-ofetch-interceptor/SKILL.md) 落地)在 401 时:

```ts
onResponseError({ response }) {
  if (response.status === 401) {
    authActions.signOut();
    router.navigate({ to: "/login", search: { redirect: location.href } });
  }
}
```

- `router` 实例从 `src/main.tsx` 单例 import(不是 hook)
- 不要在每个组件里 catch 401 — 一处拦截即可

## 禁忌

- ❌ `useEffect(() => { if (!token) navigate('/login') })`(loading flash + 双重渲染)
- ❌ 把 token 塞 URL search param(`/page?token=xxx`)
- ❌ 把 token 塞 React Context(订阅者全部 re-render)
- ❌ 每个受保护组件单独写守卫(应在 layout route `_auth.tsx` 一处)
- ❌ `authStore.state.token = "..."`(必须 `setState`)
- ❌ 登录成功后用 `window.location.href`(走 router `navigate`)

## 完整可运行范本

见 [`example-basic.tsx`](./example-basic.tsx) — `_auth.tsx` + `login.tsx` + `authStore` 三件套最小骨架。

## 相关 rule / eval

- rule:[`no-useeffect-in-component`](../../rules/no-useeffect-in-component.md)
- eval:`a4-auth-guard-via-beforeload`(待建,P0 同期落)

## 源追溯

见 [`references/REFERENCE.md`](./references/REFERENCE.md)。
