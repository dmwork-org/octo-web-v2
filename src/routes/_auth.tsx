import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { authStore } from "@/features/base/stores/auth";

export const Route = createFileRoute("/_auth")({
  beforeLoad: ({ location }) => {
    if (!authStore.state.token) {
      const redirectTo = encodeURIComponent(location.href);
      throw redirect({ href: `/login?redirect=${redirectTo}` });
    }
  },
  component: () => (
    <div className="min-h-screen">
      <Outlet />
    </div>
  ),
});
