import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { refreshThreadListAfterSend, threadListQueryKey } from "./thread-list-cache";

describe("refreshThreadListAfterSend", () => {
  it("updates cached parent thread activity for a sent thread message", () => {
    vi.useFakeTimers();
    const qc = new QueryClient();
    qc.setQueryData(threadListQueryKey("g1"), [
      { short_id: "t1", name: "old", updated_at: "2026-07-07T08:00:00Z" },
      { short_id: "t2", name: "other", updated_at: "2026-07-07T08:00:00Z" },
    ]);

    const result = refreshThreadListAfterSend(
      qc,
      { channelID: "g1____t1", channelType: 5 },
      { activeAt: "2026-07-07T09:18:00Z" },
    );

    expect(result?.groupNo).toBe("g1");
    expect(qc.getQueryData(threadListQueryKey("g1"))).toEqual([
      {
        short_id: "t1",
        name: "old",
        updated_at: "2026-07-07T09:18:00Z",
        last_message_at: "2026-07-07T09:18:00Z",
      },
      { short_id: "t2", name: "other", updated_at: "2026-07-07T08:00:00Z" },
    ]);
    vi.useRealTimers();
  });
});
