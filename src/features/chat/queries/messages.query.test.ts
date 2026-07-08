import { describe, expect, it } from "vitest";
import { getNewerMessagesPageParam } from "./messages.query";

const page = (seqs: number[]) => seqs.map((messageSeq) => ({ messageSeq }));

describe("getNewerMessagesPageParam", () => {
  it("continues from the next seq when a located page has newer messages", () => {
    expect(getNewerMessagesPageParam(page(Array.from({ length: 30 }, (_, i) => i + 10)), 50)).toBe(
      40,
    );
    expect(getNewerMessagesPageParam(page([10, 11]), 50)).toBe(12);
    expect(getNewerMessagesPageParam(page([10, 11]), 50, { forceNewer: true })).toBe(12);
  });

  it("stops when latest is already loaded or unknown", () => {
    expect(
      getNewerMessagesPageParam(page(Array.from({ length: 30 }, (_, i) => i + 21)), 50),
    ).toBeUndefined();
    expect(getNewerMessagesPageParam(page([10, 11]), 0)).toBeUndefined();
    expect(getNewerMessagesPageParam(page([10, 11]), 11, { forceNewer: true })).toBeUndefined();
    expect(getNewerMessagesPageParam([], 50, { forceNewer: true })).toBeUndefined();
  });
});
