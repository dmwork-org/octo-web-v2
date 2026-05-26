import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/query-client";
import { router } from "./lib/router";
import { persistAuth } from "./features/base/stores/auth";
import { persistSpace, spaceStore } from "./features/base/stores/space";
import { persistEndpoint, endpointStore } from "./features/base/stores/endpoint";
import { wireChatSelectedResetOnSpaceChange } from "./features/chat/stores/chat-selected";
import { wireChatSelectionResetOnChannelChange } from "./features/chat/stores/chat-selection";
import "./index.css";

persistAuth();
persistSpace();
persistEndpoint();
wireChatSelectedResetOnSpaceChange();
// reply 已改为 per-channel 自然隔离,不再需要切换时 reset
wireChatSelectionResetOnChannelChange();

spaceStore.subscribe(() => {
  queryClient.clear();
});
endpointStore.subscribe(() => {
  queryClient.clear();
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
