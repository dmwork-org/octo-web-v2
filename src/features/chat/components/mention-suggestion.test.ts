import { describe, expect, it } from "vitest";
import { canHideMentionPopup } from "./mention-suggestion";

function popup(firstElementChild: Element | null, isDestroyed = false) {
  return {
    popper: { firstElementChild } as HTMLDivElement,
    state: {
      isDestroyed,
      isEnabled: true,
      isMounted: true,
      isShown: true,
      isVisible: true,
    },
  };
}

describe("canHideMentionPopup", () => {
  it("rejects destroyed or externally stripped popups", () => {
    expect(canHideMentionPopup(null)).toBe(false);
    expect(canHideMentionPopup(popup({} as Element, true))).toBe(false);
    expect(canHideMentionPopup(popup(null))).toBe(false);
  });

  it("allows intact popups", () => {
    expect(canHideMentionPopup(popup({} as Element))).toBe(true);
  });
});
