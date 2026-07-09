// Push a running unread count to the Electron main process so it can drive
// the macOS status-bar tray title and Dock badge. Same visibility rules as
// useFaviconUnreadBadge: current space, mute-aware. No-op in a plain browser.
import { useEffect } from "react";
import { useStore } from "@tanstack/react-store";
import WKSDK, { type Conversation } from "wukongimjssdk";
import { spaceStore } from "@/features/base/stores/space";
import { isConversationOfSpace } from "@/features/base/lib/space-filter";
import { effectiveMute } from "@/features/chat/lib/conversation-last-content";

type DesktopApi = {
  setUnreadCount?: (n: number) => Promise<{ ok: boolean }>;
};

function getDesktop(): DesktopApi | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { octoDesktop?: DesktopApi }).octoDesktop;
}

function computeUnread(conversations: Conversation[], spaceId: string | null): number {
  let total = 0;
  for (const c of conversations) {
    // WKSDK may leave `unread` undefined on freshly-created / mid-sync
    // conversations; `undefined <= 0` is false so a naive read poisons
    // `total` into NaN, which surfaces as literal "NaN" in the tray.
    const u = typeof c.unread === "number" && Number.isFinite(c.unread) ? c.unread : 0;
    if (u <= 0) continue;
    if (!isConversationOfSpace(c, spaceId)) continue;
    if (effectiveMute(c)) continue;
    total += u;
  }
  return total;
}

/**
 * Renderer → Electron main unread count feed. Wired only when the desktop
 * bridge is present so browser users pay nothing.
 */
export function useDesktopUnreadBadge(uid: string | null) {
  const spaceId = useStore(spaceStore, (s) => s.spaceId);

  useEffect(() => {
    const desktop = getDesktop();
    if (!desktop) return;
    if (!uid) {
      void desktop.setUnreadCount?.(0);
      return;
    }

    const sdk = WKSDK.shared();
    let disposed = false;
    let last = -1;

    const push = () => {
      if (disposed) return;
      const n = computeUnread(sdk.conversationManager.conversations ?? [], spaceId);
      if (n === last) return;
      last = n;
      void desktop.setUnreadCount?.(n);
    };

    push();
    sdk.conversationManager.addConversationListener(push);
    sdk.channelManager.addListener(push);

    return () => {
      disposed = true;
      sdk.conversationManager.removeConversationListener(push);
      sdk.channelManager.removeListener(push);
      void desktop.setUnreadCount?.(0);
    };
  }, [uid, spaceId]);
}
