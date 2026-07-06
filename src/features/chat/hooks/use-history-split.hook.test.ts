import { describe, expect, it } from "vitest";
import { hasVisibleMessageAfterHistorySplitAnchor } from "./use-history-split.hook";

describe("hasVisibleMessageAfterHistorySplitAnchor", () => {
  it("does not render the history split when the anchor is the last visible message", () => {
    expect(
      hasVisibleMessageAfterHistorySplitAnchor([{ messageSeq: 10 }, { messageSeq: 11 }], 11),
    ).toBe(false);
  });

  it("renders the history split only when visible new messages exist after the anchor", () => {
    expect(
      hasVisibleMessageAfterHistorySplitAnchor(
        [{ messageSeq: 10 }, { messageSeq: 11 }, { messageSeq: 12 }],
        11,
      ),
    ).toBe(true);
  });

  it("ignores an empty split anchor", () => {
    expect(hasVisibleMessageAfterHistorySplitAnchor([{ messageSeq: 10 }], 0)).toBe(false);
  });
});
