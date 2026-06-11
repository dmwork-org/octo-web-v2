import { Outlet, createRootRouteWithContext, ErrorComponent } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { MessageContainer } from "@/components/ui/message";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NotFoundView } from "@/components/ui/not-found";

interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: () => (
    <TooltipProvider delayDuration={500}>
      <Outlet />
      <MessageContainer />
    </TooltipProvider>
  ),
  errorComponent: ErrorComponent,
  notFoundComponent: NotFoundView,
});
