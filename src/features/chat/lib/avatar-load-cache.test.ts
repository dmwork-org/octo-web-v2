import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  claimAvatarLoad,
  getAvatarLoadStatus,
  markAvatarFailed,
  markAvatarLoaded,
  releaseAvatarLoad,
  resetAvatarLoadCacheForTest,
  subscribeAvatarLoad,
} from "./avatar-load-cache";

describe("avatar-load-cache", () => {
  beforeEach(() => {
    resetAvatarLoadCacheForTest();
  });

  it("lets only one renderer claim an avatar URL while it is loading", () => {
    expect(claimAvatarLoad("/groups/g1/avatar")).toBe(true);
    expect(claimAvatarLoad("/groups/g1/avatar")).toBe(false);
    expect(getAvatarLoadStatus("/groups/g1/avatar")).toBe("loading");
  });

  it("notifies subscribers when an avatar finishes", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeAvatarLoad("/users/u1/avatar", listener);

    expect(claimAvatarLoad("/users/u1/avatar")).toBe(true);
    markAvatarLoaded("/users/u1/avatar");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getAvatarLoadStatus("/users/u1/avatar")).toBe("loaded");

    unsubscribe();
    markAvatarFailed("/users/u1/avatar");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("releases abandoned in-flight loads so a later renderer can retry", () => {
    expect(claimAvatarLoad("/groups/g2/avatar")).toBe(true);
    releaseAvatarLoad("/groups/g2/avatar");

    expect(getAvatarLoadStatus("/groups/g2/avatar")).toBeUndefined();
    expect(claimAvatarLoad("/groups/g2/avatar")).toBe(true);
  });
});
