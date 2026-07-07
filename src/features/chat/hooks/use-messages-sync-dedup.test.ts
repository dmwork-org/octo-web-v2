import { describe, expect, it } from "vitest";
import { shouldSyncMessagesOnEnter, SYNC_DEDUP_MS } from "./use-messages-sync.hook";

describe("useMessagesSync syncMessages dedup (issues #216/#222)", () => {
  it("skips repeat enter within 30s when cache already has the latest message", () => {
    expect(
      shouldSyncMessagesOnEnter({
        pages: [[{ messageSeq: 10 }]],
        latestMessageSeq: 10,
        now: 10_000,
        lastSyncAt: 1_000,
      }),
    ).toBe(false);
  });

  it("syncs within 30s when conversation latest seq is newer than cache", () => {
    expect(
      shouldSyncMessagesOnEnter({
        pages: [[{ messageSeq: 10 }]],
        latestMessage: { messageSeq: 11 },
        latestMessageSeq: 11,
        now: 10_000,
        lastSyncAt: 9_000,
      }),
    ).toBe(true);
  });

  it("syncs within 30s when latest message identity is missing from cache", () => {
    expect(
      shouldSyncMessagesOnEnter({
        pages: [[{ messageSeq: 0, messageID: "old" }]],
        latestMessage: { messageSeq: 0, messageID: "new" },
        latestMessageSeq: 0,
        now: 10_000,
        lastSyncAt: 9_000,
      }),
    ).toBe(true);
  });

  it("keeps the dedup window when latest message identity is already cached", () => {
    expect(
      shouldSyncMessagesOnEnter({
        pages: [[{ messageSeq: 0, messageID: "same" }]],
        latestMessage: { messageSeq: 0, messageID: "same" },
        latestMessageSeq: 0,
        now: 10_000,
        lastSyncAt: 9_000,
      }),
    ).toBe(false);
  });

  it("syncs after the dedup window as a fallback", () => {
    expect(
      shouldSyncMessagesOnEnter({
        pages: [[{ messageSeq: 10 }]],
        latestMessageSeq: 10,
        now: 31_001,
        lastSyncAt: 1_000,
      }),
    ).toBe(true);
  });

  it("keeps the dedup window at 30s", () => {
    expect(SYNC_DEDUP_MS).toBe(30_000);
  });
});
