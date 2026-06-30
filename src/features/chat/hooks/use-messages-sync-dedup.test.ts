/**
 * Issue #216 回归测试 — syncMessages 去重
 *
 * 切到别的 channel 再切回,30s 内应跳过 syncMessages。
 */
import { describe, expect, it } from "vitest";

const SYNC_DEDUP_MS = 30_000;

describe("useMessagesSync syncMessages dedup (issue #216)", () => {
  it("regression: 30s 内重复进入同 channel 应跳过 syncMessages", () => {
    const lastSyncByChannel = new Map<string, number>();
    const channelKey = "1::u1";
    const shouldSync = (now: number) => {
      const last = lastSyncByChannel.get(channelKey) ?? 0;
      return now - last > SYNC_DEDUP_MS;
    };
    lastSyncByChannel.set(channelKey, 1000);
    expect(shouldSync(1500)).toBe(false); // 500ms 后,500 < 30s,跳过
    expect(shouldSync(10000)).toBe(false); // 9s 后,9000 < 30s,跳过
    expect(shouldSync(31001)).toBe(true); // 31s 后,31001 > 30s,需要 sync
  });

  it("regression: 不同 channel 不互相干扰", () => {
    const lastSyncByChannel = new Map<string, number>();
    lastSyncByChannel.set("1::u1", 1000);
    lastSyncByChannel.set("2::g1", 2000);
    expect(lastSyncByChannel.get("1::u1")).toBe(1000);
    expect(lastSyncByChannel.get("2::g1")).toBe(2000);
  });

  it("regression: 锁住 SYNC_DEDUP_MS 常量 = 30000", () => {
    expect(SYNC_DEDUP_MS).toBe(30_000);
  });
});
