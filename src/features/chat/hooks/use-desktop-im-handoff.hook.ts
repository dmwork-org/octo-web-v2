// Wire the renderer's IM login lifecycle to the Electron main-process IM
// client (see desktop/src/im/main-im-client.ts). No-op when running in a
// plain browser, so the web build is unaffected.
//
// Behaviour, from the renderer's perspective:
//   - On mount with a valid (uid, token): tell main "you can let go, I've
//     got the WS", pushing credentials so a later handoff-to-main can
//     reconnect with the same identity. Main-process client currently
//     disconnects and stashes the config.
//   - On unmount (logout / component teardown): tell main to take over.
//   - Also expose a window-scoped disconnect hook so main's window-close
//     handler can politely evict us before it re-uses the WS.
import { useEffect } from "react";
import WKSDK from "wukongimjssdk";
import { chatSelectedStore } from "@/features/chat/stores/chat-selected";
import { spaceStore } from "@/features/base/stores/space";
import { isNotificationsOff } from "@/features/base/lib/notification-util";

type DesktopApi = {
  handoffToRenderer?: (cfg: {
    uid: string;
    token: string;
    wsUrl?: string;
    spaceId?: string;
  }) => Promise<{ ok: boolean }>;
  handoffToMain?: () => Promise<{ ok: boolean }>;
  setCurrentChannel?: (
    ch: { channelID: string; channelType: number } | null,
  ) => Promise<{ ok: boolean }>;
  setSpace?: (spaceId: string | null) => Promise<{ ok: boolean }>;
  setNotificationsOff?: (off: boolean) => Promise<{ ok: boolean }>;
  // Main fires this after beginHandoffToRenderer() releases the WS on
  // window show. We answer by re-issuing sdk.connect() — the SDK's own
  // status listener would not otherwise fire, since our IMProvider
  // effect only reruns on (uid, token) change and neither shifts here.
  onImReconnectRequest?: (fn: () => void) => () => void;
};

function getDesktop(): DesktopApi | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { octoDesktop?: DesktopApi }).octoDesktop;
}

/**
 * Renderer ↔ main IM WS handoff. See desktop/src/im/main-im-client.ts for the
 * main-process side. Renderer is the WS holder while it's alive; main takes
 * over during window.hide()→show() so notifications can keep arriving.
 */
export function useDesktopImHandoff(uid: string | null, token: string | null) {
  useEffect(() => {
    const desktop = getDesktop();
    if (!desktop) return;
    if (!uid || !token) return;

    // Push credentials + tell main to disconnect its own client. Config
    // stays cached on main so a later handoff-back-to-main can reconnect.
    void desktop.handoffToRenderer?.({
      uid,
      token,
      wsUrl: WKSDK.shared().config.addr,
      spaceId: spaceStore.state.spaceId ?? undefined,
    });

    // Expose a hook the main process can call before it grabs the WS. Using
    // a window-scoped function rather than an IPC event so main can await
    // the disconnect completing before its own connect().
    const globalScope = window as unknown as {
      __octoDesktopImDisconnect?: () => void;
    };
    globalScope.__octoDesktopImDisconnect = () => {
      // SDK's disconnect() sets needReconnect=false so it won't race main.
      WKSDK.shared().connectManager.disconnect();
    };

    // Push state changes to main so its notification filter stays accurate.
    const unsubChan = chatSelectedStore.subscribe(() => {
      const ch = chatSelectedStore.state.channel;
      void desktop.setCurrentChannel?.(
        ch ? { channelID: ch.channelID, channelType: ch.channelType } : null,
      );
    });
    const unsubSpace = spaceStore.subscribe(() => {
      void desktop.setSpace?.(spaceStore.state.spaceId ?? null);
    });
    // Off-flag lives in localStorage without a store; poll on interval —
    // cheap and only runs in electron. 5s cadence matches how often the
    // user could realistically toggle it in settings.
    let lastOff = isNotificationsOff();
    void desktop.setNotificationsOff?.(lastOff);
    const offPoll = window.setInterval(() => {
      const now = isNotificationsOff();
      if (now !== lastOff) {
        lastOff = now;
        void desktop.setNotificationsOff?.(now);
      }
    }, 5000);

    // Handoff-back-to-renderer trigger: main invokes this via IPC once
    // it has disconnected its own client. Re-run sdk.connect() so the WS
    // comes back without waiting for a login-state change (which would
    // never fire during a hide→show cycle).
    const offReconnect = desktop.onImReconnectRequest?.(() => {
      const sdk = WKSDK.shared();
      // Guard: only reconnect if we still hold this identity. Kicked or
      // logged-out state will land here without valid config; skip.
      if (sdk.config.uid !== uid || sdk.config.token !== token) return;
      sdk.connect();
    });

    return () => {
      // Renderer is going away (logout or unmount). Let main take over.
      window.clearInterval(offPoll);
      unsubChan.unsubscribe();
      unsubSpace.unsubscribe();
      delete globalScope.__octoDesktopImDisconnect;
      offReconnect?.();
      void desktop.handoffToMain?.();
    };
  }, [uid, token]);
}
