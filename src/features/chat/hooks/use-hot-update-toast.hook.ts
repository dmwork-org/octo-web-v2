// Show a global "update ready — restart to apply" toast when the
// Electron shell's hot-update pipeline finishes installing a fresh
// web bundle. The bundle is on disk in userData but the current
// BrowserWindow is still running the previously-resolved version;
// only a full relaunch swaps it in (see resolveWebRoot in main.ts).
//
// No-op in a plain browser — the desktop bridge is what fires the
// "hot-update:ready" IPC in the first place.
import { useEffect } from "react";
import { message } from "@/components/ui/message";

type DesktopApi = {
  onHotUpdateReady?: (fn: (version: string) => void) => () => void;
  relaunch?: () => Promise<{ ok: boolean }>;
};

function getDesktop(): DesktopApi | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { octoDesktop?: DesktopApi }).octoDesktop;
}

/**
 * Subscribes to hot-update completion notifications from the main process
 * and surfaces a persistent toast with a "restart now" action. Mounted
 * once at the app level (IMProvider).
 */
export function useHotUpdateToast() {
  useEffect(() => {
    const desktop = getDesktop();
    if (!desktop?.onHotUpdateReady) return;

    const off = desktop.onHotUpdateReady((version) => {
      // duration: 0 keeps the toast up until the user acts on it.
      // Same `key` collapses repeated ready-events (should be rare —
      // only if a subsequent hot-update completes before the user has
      // restarted from the previous one) into a single visible toast.
      message.info(`桌面版有新更新可用,重启后生效`, {
        key: "hot-update-ready",
        duration: 0,
        action: {
          label: "立即重启",
          onClick: () => {
            void desktop.relaunch?.();
          },
        },
      });
      // No-op: version is available for future use (e.g. logging or
      // showing the version in the toast); intentionally not printed
      // to avoid leaking sha to the user.
      void version;
    });

    return () => off();
  }, []);
}
