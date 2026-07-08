import { describe, expect, it } from "vitest";
import {
  canHideMentionPopup,
  getMentionPopupMaxHeight,
  getMentionPopupPlacement,
  getMentionPopupWidth,
} from "./mention-suggestion";

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

describe("getMentionPopupMaxHeight", () => {
  it("caps to the design max when one side has room", () => {
    expect(getMentionPopupMaxHeight({ top: 500, bottom: 520 }, 800)).toBe(220);
  });

  it("shrinks to the larger available viewport side near edges", () => {
    expect(getMentionPopupMaxHeight({ top: 80, bottom: 100 }, 180)).toBe(72);
  });
});

describe("getMentionPopupWidth", () => {
  it("uses the design width when viewport is wide enough", () => {
    expect(getMentionPopupWidth(980)).toBe(420);
  });

  it("shrinks inside narrow viewports", () => {
    expect(getMentionPopupWidth(320)).toBe(304);
  });
});

describe("getMentionPopupPlacement", () => {
  it("opens from the right edge when caret is near the viewport right side", () => {
    expect(getMentionPopupPlacement({ left: 900 }, 980)).toBe("top-end");
  });

  it("opens from the left edge when caret has enough right-side room", () => {
    expect(getMentionPopupPlacement({ left: 120 }, 980)).toBe("top-start");
  });
});
