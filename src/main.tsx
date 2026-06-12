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
import { persistChatSidebarTab } from "./features/chat/stores/chat-sidebar-tab";
import { clearFetchedTitleCache } from "./features/chat/lib/live-channel-title";
import { wireChatSelectionResetOnChannelChange } from "./features/chat/stores/chat-selection";
import { runPostLogoutCleanupIfNeeded } from "./features/login/oidc/logout-cleanup";
import "./index.css";

const PRELOAD_ERROR_RELOAD_KEY = "octo:preload-error-reload-at";

window.addEventListener("vite:preloadError", (event) => {
  const lastReloadAt = Number(sessionStorage.getItem(PRELOAD_ERROR_RELOAD_KEY) ?? 0);
  const now = Date.now();
  if (now - lastReloadAt < 10_000) return;

  event.preventDefault();
  sessionStorage.setItem(PRELOAD_ERROR_RELOAD_KEY, String(now));
  window.location.reload();
});

// IdP 回源到本站时兜底清:如果 sessionStorage 含 OIDC post-logout 标志,
// 启动时再清一次本地 auth/space/pending,避免残留 token 让登录页直接重定向回主页。
// 必须在 persistAuth 之前调,否则下一行 readPersisted 会先读到旧 token。
runPostLogoutCleanupIfNeeded();

persistAuth();
persistSpace();
persistEndpoint();
persistChatSidebarTab();
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
