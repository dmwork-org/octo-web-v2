// Auth guard 最小骨架 — _auth layout + login route + authStore 三件套
// 来源:TanStack Router authenticated routes 官方指南 + TanStack Store 单例模式
// 见 ./references/REFERENCE.md

import { Store } from "@tanstack/store";
import { Outlet, createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useStore } from "@tanstack/react-store";
import { z } from "zod";

// ─── 1. authStore(实际项目放 src/features/base/stores/auth.ts)──────────────
interface AuthState {
  token: string | null;
  user: { id: string; name: string } | null;
}

const authStore = new Store<AuthState>({ token: null, user: null });

const authActions = {
  signIn: (token: string, user: AuthState["user"]) => authStore.setState(() => ({ token, user })),
  signOut: () => authStore.setState(() => ({ token: null, user: null })),
};

// ─── 2. _auth layout route(beforeLoad 守卫所有子路由)─────────────────────
export const AuthLayoutRoute = createFileRoute("/_auth")({
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
  const user = useStore(authStore, (state) => state.user);
  return (
    <div>
      <header>signed in as {user?.name}</header>
      <Outlet />
    </div>
  );
}

// ─── 3. login 公开路由(消费 search.redirect)─────────────────────────────
const loginSearchSchema = z.object({ redirect: z.string().optional() });

export const LoginRoute = createFileRoute("/login")({
  validateSearch: loginSearchSchema,
  component: LoginPage,
});

function LoginPage() {
  const { redirect: redirectTo } = LoginRoute.useSearch();
  const navigate = useNavigate();

  const onSubmit = async () => {
    // 实际项目调 loginMutation().mutateAsync(form)
    const fakeToken = "demo-token";
    const fakeUser = { id: "u1", name: "demo" };
    authActions.signIn(fakeToken, fakeUser);
    navigate({ to: redirectTo ?? "/", replace: true });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <button type="submit">sign in</button>
    </form>
  );
}
