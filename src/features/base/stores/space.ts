import { Store } from "@tanstack/react-store";

export interface SpaceState {
  spaceId: string | null;
}

const STORAGE_KEY = "octo:space";

function readPersisted(): SpaceState {
  if (typeof window === "undefined") return { spaceId: null };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return { spaceId: raw && raw.length > 0 ? raw : null };
  } catch {
    return { spaceId: null };
  }
}

export const spaceStore = new Store<SpaceState>(readPersisted());

export const spaceActions = {
  setSpace: (spaceId: string | null) => spaceStore.setState(() => ({ spaceId })),
};

export function persistSpace(): void {
  if (typeof window === "undefined") return;
  spaceStore.subscribe(() => {
    try {
      const { spaceId } = spaceStore.state;
      if (spaceId) {
        window.localStorage.setItem(STORAGE_KEY, spaceId);
      } else {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // ignore
    }
  });
}
