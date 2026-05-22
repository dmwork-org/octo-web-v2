// _use-sync-selection-to-url.tsx — co-located hook (必须命名)
// component 里的副作用被抽到本 hook

import { useEffect } from "react";

export function useSyncSelectionToUrl(selection: string[]): void {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (selection.length === 0) {
      url.searchParams.delete("sel");
    } else {
      url.searchParams.set("sel", selection.join(","));
    }
    window.history.replaceState(null, "", url);
  }, [selection]);
}
