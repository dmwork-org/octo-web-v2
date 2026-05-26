import { Outlet, createRootRouteWithContext, ErrorComponent } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/semi-bridge/toast";

interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: () => (
    <>
      <Outlet />
      <Toaster position="top-center" richColors closeButton />
      {/*
        Devtools 暂时关掉(挡输入框,且原生不支持拖拽位置)。需要时把下面恢复:
          import { TanStackRouterDevtools } from "@tanstack/router-devtools";
          import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
          {import.meta.env.DEV && (
            <>
              <TanStackRouterDevtools position="bottom-right" />
              <ReactQueryDevtools buttonPosition="bottom-left" />
            </>
          )}
      */}
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
