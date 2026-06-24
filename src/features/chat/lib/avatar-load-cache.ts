type AvatarLoadStatus = "loading" | "loaded" | "failed";

const statuses = new Map<string, AvatarLoadStatus>();
// ponytail: session cache; add LRU only if avatar URL churn becomes measurable.
const listeners = new Map<string, Set<() => void>>();

function notify(url: string): void {
  listeners.get(url)?.forEach((listener) => listener());
}

export function getAvatarLoadStatus(url: string): AvatarLoadStatus | undefined {
  return statuses.get(url);
}

export function claimAvatarLoad(url: string): boolean {
  if (!url || statuses.has(url)) return false;
  statuses.set(url, "loading");
  return true;
}

export function releaseAvatarLoad(url: string): void {
  if (statuses.get(url) !== "loading") return;
  statuses.delete(url);
  notify(url);
}

export function markAvatarLoaded(url: string): void {
  if (!url) return;
  statuses.set(url, "loaded");
  notify(url);
}

export function markAvatarFailed(url: string): void {
  if (!url) return;
  statuses.set(url, "failed");
  notify(url);
}

export function subscribeAvatarLoad(url: string, listener: () => void): () => void {
  if (!url) return () => {};
  let set = listeners.get(url);
  if (!set) {
    set = new Set();
    listeners.set(url, set);
  }
  set.add(listener);
  return () => {
    set?.delete(listener);
    if (set?.size === 0) listeners.delete(url);
  };
}

export function resetAvatarLoadCacheForTest(): void {
  statuses.clear();
  listeners.clear();
}
