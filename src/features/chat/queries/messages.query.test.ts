import { describe, expect, it } from "vitest";
import { getNewerMessagesPageParam } from "./messages.query";

const page = (seqs: number[]) => seqs.map((messageSeq) => ({ messageSeq }));

describe("getNewerMessagesPageParam", () => {
  it("continues from the next seq when a located page has newer messages", () => {
    expect(getNewerMessagesPageParam(page(Array.from({ length: 30 }, (_, i) => i + 10)), 50)).toBe(
      40,
    );
  });

  it("stops on short pages or when latest is already loaded", () => {
    expect(getNewerMessagesPageParam(page([10, 11]), 50)).toBeUndefined();
    expect(
      getNewerMessagesPageParam(page(Array.from({ length: 30 }, (_, i) => i + 21)), 50),
    ).toBeUndefined();
  });
});
