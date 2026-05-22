import { Outlet, createRootRouteWithContext, ErrorComponent } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/router-devtools";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import type { QueryClient } from "@tanstack/react-query";

interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: () => (
    <>
      <Outlet />
      {import.meta.env.DEV && (
        <>
          <TanStackRouterDevtools position="bottom-right" />
          <ReactQueryDevtools buttonPosition="bottom-left" />
        </>
      )}
    </>
  ),
  errorComponent: ErrorComponent,
  notFoundComponent: () => (
    <div style={{ padding: 24 }}>
      <h1>404</h1>
      <p>页面不存在</p>
    </div>
  ),
});
