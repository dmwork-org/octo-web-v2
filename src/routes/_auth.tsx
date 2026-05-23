import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { authStore } from "@/features/base/stores/auth";
import { AppShell } from "@/features/base/layout/app-shell";

export const Route = createFileRoute("/_auth")({
  beforeLoad: ({ location }) => {
    if (!authStore.state.token) {
      const redirectTo = encodeURIComponent(location.href);
      throw redirect({ href: `/login?redirect=${redirectTo}` });
    }
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
