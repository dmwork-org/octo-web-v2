import { Store } from "@tanstack/react-store";

interface AvatarVersionState {
  versions: Record<string, number>;
}

export const avatarVersionStore = new Store<AvatarVersionState>({
  versions: {},
});

const fallbackVersions = new Map<string, number>();
const AVATAR_TAG_STORAGE_PREFIX = "channelAvatarTag:";

function avatarTagStorageKey(uid: string, channelType?: number): string {
  return channelType == null
    ? `${AVATAR_TAG_STORAGE_PREFIX}${uid}`
    : `${AVATAR_TAG_STORAGE_PREFIX}${channelType}${uid}`;
}

function readStoredAvatarVersion(key: string): number | null {
  if (typeof window === "undefined") return null;
  try {
    const value = Number(window.localStorage.getItem(key));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function writeStoredAvatarVersion(key: string, version: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, String(version));
  } catch {
    // ignore storage errors
  }
}

export function ensureAvatarVersionFor(uid: string, channelType?: number): number {
  const key = avatarTagStorageKey(uid, channelType);
  const current = fallbackVersions.get(key);
  if (current) return current;
  const stored = readStoredAvatarVersion(key);
  if (stored) {
    fallbackVersions.set(key, stored);
    return stored;
  }
  const next = Date.now();
  fallbackVersions.set(key, next);
  writeStoredAvatarVersion(key, next);
  return next;
}

export function avatarVersionFor(uid: string, channelType?: number): number {
  return avatarVersionStore.state.versions[uid] ?? ensureAvatarVersionFor(uid, channelType);
}

export const avatarVersionActions = {
  bump: (uid: string, channelType?: number): number => {
    const version = Date.now();
    const key = avatarTagStorageKey(uid, channelType);
    fallbackVersions.set(key, version);
    writeStoredAvatarVersion(key, version);
    avatarVersionStore.setState((state) => ({
      versions: {
        ...state.versions,
        [uid]: version,
      },
    }));
    return version;
  },
};
