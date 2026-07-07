import { describe, expect, it } from "vitest";
import { parseThreadTimeMs, threadActiveTime, threadActiveTimeMs } from "../lib/thread-active-time";

describe("threadActiveTime", () => {
  it("prefers last message time over thread metadata times", () => {
    expect(
      threadActiveTime({
        last_message_at: "2026-07-07T11:30:00Z",
        updated_at: "2026-07-07T11:15:00Z",
        created_at: "2026-07-07T11:00:00Z",
      }),
    ).toBe("2026-07-07T11:30:00Z");
  });

  it("falls back to updated and created times", () => {
    expect(
      threadActiveTime({
        updated_at: "2026-07-07T11:15:00Z",
        created_at: "2026-07-07T11:00:00Z",
      }),
    ).toBe("2026-07-07T11:15:00Z");
    expect(threadActiveTime({ created_at: "2026-07-07T11:00:00Z" })).toBe("2026-07-07T11:00:00Z");
  });

  it("parses timezone-less backend timestamps as UTC", () => {
    expect(parseThreadTimeMs("2026-07-07T09:18:00")).toBe(Date.parse("2026-07-07T09:18:00Z"));
    expect(parseThreadTimeMs("2026-07-07 09:18:00")).toBe(Date.parse("2026-07-07T09:18:00Z"));
  });

  it("preserves explicit timezone timestamps", () => {
    expect(parseThreadTimeMs("2026-07-07T09:18:00+08:00")).toBe(
      Date.parse("2026-07-07T09:18:00+08:00"),
    );
    expect(parseThreadTimeMs("2026-07-07T09:18:00Z")).toBe(Date.parse("2026-07-07T09:18:00Z"));
  });

  it("uses normalized active time for sorting", () => {
    expect(threadActiveTimeMs({ last_message_at: "2026-07-07T09:18:00" })).toBe(
      Date.parse("2026-07-07T09:18:00Z"),
    );
  });
});
