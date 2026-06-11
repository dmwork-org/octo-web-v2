import { useEffect, type ReactNode } from "react";
import { useStore } from "@tanstack/react-store";
import WKSDK, { ConnectStatus, type ConnectAddrCallback } from "wukongimjssdk";
import { authActions, authStore } from "@/features/base/stores/auth";
import { imConnectionActions, type ImConnectionStatus } from "@/features/base/stores/im-connection";
import { getImConnectAddrs } from "@/features/base/api/endpoints/im.api";
import { registerImCallbacks } from "@/features/base/providers/im-callbacks";
import { registerContentTypes } from "@/features/base/im/register-content";
import { useDesktopNotifications } from "@/features/chat/hooks/use-desktop-notifications.hook";
import { useCmdSync } from "@/features/chat/hooks/use-cmd-sync.hook";
import { TypingManager } from "@/features/chat/services/typing-manager";
import { t } from "@/lib/i18n/instance";
import { router } from "@/lib/router";

/**
 * 把 SDK ConnectStatus 翻译成 application 层语义(见 im-connection.ts)。
 */
function mapStatus(status: ConnectStatus): ImConnectionStatus {
  switch (status) {
    case ConnectStatus.Connected:
      return "connected";
    case ConnectStatus.Connecting:
      return "connecting";
    case ConnectStatus.Disconnect:
      return "disconnected";
    case ConnectStatus.ConnectFail:
      return "failed";
    case ConnectStatus.ConnectKick:
      return "kicked";
    default:
      return "disconnected";
  }
}

/**
 * 把 SDK 强制踢出 / 鉴权失败 翻译成"被踢回登录页"。
 * 旧项目在 App.tsx:604 同样语义:ConnectKick 或 reasonCode===2 触发 logout。
 */
function handleAuthLost(reason: "kicked" | "auth-failed") {
  authActions.signOut();
  imConnectionActions.setError(
    reason === "kicked"
      ? t("base.connection.kickedByOtherDevice")
      : t("base.connection.authFailed"),
  );
  const redirectTo = encodeURIComponent(window.location.href);
  void router.navigate({ href: `/login?redirect=${redirectTo}` });
}

/**
 * IM 连接生命周期 hook(必须在登录后 mount):
 * - 注册 SDK provider callbacks(sync conversation / channelInfo / sync messages / upload task 等)
 * - 注册自定义 MessageContent(file/voice/video 等,SDK 内置只覆盖 text/image)
 * - 设 SDK config.uid / token / connectAddrCallback
 * - 注册 status listener,把 SDK 状态映射进 imConnectionStore;**重连成功时清空残留 typing**
 *   (对齐上游 7a42c23a / #187)
 * - 注册 visibilitychange,**回前台时清空残留 typing**(同上,双层防御)
 * - 立即 connect();unmount 时 disconnect + remove listener
 *
 * 不在 component 本体放裸 useEffect — 抽出到命名 hook(no-useeffect-in-component 规则)。
 */
function useImConnection(uid: string | null, token: string | null) {
  useEffect(() => {
    if (!uid || !token) return;
    const sdk = WKSDK.shared();

    registerImCallbacks();
    registerContentTypes();

    sdk.config.uid = uid;
    sdk.config.token = token;
    sdk.config.provider.connectAddrCallback = (callback: ConnectAddrCallback) => {
      void (async () => {
        try {
          const addrs = await getImConnectAddrs(uid);
          if (addrs[0]) callback(addrs[0]);
          else imConnectionActions.setError(t("base.connection.noGateway"));
        } catch (err) {
          imConnectionActions.setError(
            err instanceof Error ? err.message : t("base.connection.fetchGatewayFailed"),
          );
        }
      })();
    };

    const listener = (status: ConnectStatus, reasonCode?: number) => {
      if (status === ConnectStatus.ConnectKick) {
        imConnectionActions.setStatus("kicked", reasonCode ?? null);
        handleAuthLost("kicked");
        return;
      }
      if (reasonCode === 2) {
        imConnectionActions.setStatus("failed", reasonCode);
        handleAuthLost("auth-failed");
        return;
      }
      imConnectionActions.setStatus(mapStatus(status), reasonCode ?? null);
      // 重连成功后清空所有残留 typing(对齐上游 7a42c23a / #187):SDK 重连只
      // reSubscribe,断连期间 bot 回复经 HTTP sync 落库不触发 WS messageListener,
      // typing 唯一清除路径失效 → 永不清。这里和 visibilitychange 双层防御。
      if (status === ConnectStatus.Connected) {
        TypingManager.resetAll();
      }
    };
    sdk.connectManager.addConnectStatusListener(listener);

    // 回前台清除残留 typing(第一层防御,对齐上游 App.tsx visibilitychange)。
    const onVisibilityChange = () => {
      if (!document.hidden) TypingManager.resetAll();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    imConnectionActions.setStatus("connecting");
    sdk.connect();

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      sdk.connectManager.removeConnectStatusListener(listener);
      sdk.disconnect();
      imConnectionActions.reset();
    };
  }, [uid, token]);
}

interface IMProviderProps {
  children: ReactNode;
}

/**
 * IM 连接守护 — 仅在 `_auth` layout 下 mount(已登录用户)。
 * 不渲染 UI,只持有 SDK 生命周期 + 把状态推到 store。
 * 业务组件直接 `useStore(imConnectionStore, s => s.status)` 即可。
 *
 * **挂桌面通知钩子**(useDesktopNotifications):订阅 chatManager onMessage,过滤后
 * 调 Web Notification API。用户首次启用时由 settings 内 requestPermission 触发授权。
 */
export function IMProvider({ children }: IMProviderProps) {
  const token = useStore(authStore, (s) => s.token);
  const uid = useStore(authStore, (s) => s.user?.uid ?? null);
  useImConnection(uid, token);
  useDesktopNotifications(uid);
  useCmdSync();
  return children;
}
