import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/query-client";
import { router } from "./lib/router";
import { I18nProvider } from "./lib/i18n/i18n-provider";
import { persistAuth } from "./features/base/stores/auth";
import { persistSpace, spaceStore } from "./features/base/stores/space";
import { persistEndpoint, endpointStore } from "./features/base/stores/endpoint";
import { wireChatSelectedResetOnSpaceChange } from "./features/chat/stores/chat-selected";
import { clearFetchedTitleCache } from "./features/chat/lib/live-channel-title";
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
  clearFetchedTitleCache();
});
endpointStore.subscribe(() => {
  queryClient.clear();
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </I18nProvider>
  </StrictMode>,
);
