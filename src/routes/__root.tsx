import { Outlet, createRootRouteWithContext, ErrorComponent } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/semi-bridge/toast";
import { TooltipProvider } from "@/components/ui/tooltip";

interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: () => (
    <TooltipProvider delayDuration={500}>
      <Outlet />
      <Toaster position="top-center" richColors closeButton />
    </TooltipProvider>
  ),
  errorComponent: ErrorComponent,
  notFoundComponent: () => (
    <div style={{ padding: 24 }}>
      <h1>404</h1>
      <p>页面不存在</p>
    </div>
  ),
});
