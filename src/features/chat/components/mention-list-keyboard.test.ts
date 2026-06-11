import { describe, expect, it } from "vitest";
import { resolveMentionListKeyAction } from "./mention-list-keyboard";

describe("resolveMentionListKeyAction", () => {
  it("does not consume keys when mention candidates are empty", () => {
    expect(resolveMentionListKeyAction("Enter", 0)).toBe("none");
    expect(resolveMentionListKeyAction("Tab", 0)).toBe("none");
    expect(resolveMentionListKeyAction("ArrowUp", 0)).toBe("none");
    expect(resolveMentionListKeyAction("ArrowDown", 0)).toBe("none");
  });

  it("maps navigation and selection keys when candidates exist", () => {
    expect(resolveMentionListKeyAction("ArrowUp", 1)).toBe("previous");
    expect(resolveMentionListKeyAction("ArrowDown", 1)).toBe("next");
    expect(resolveMentionListKeyAction("Enter", 1)).toBe("select");
    expect(resolveMentionListKeyAction("Tab", 1)).toBe("select");
    expect(resolveMentionListKeyAction("Escape", 1)).toBe("none");
  });
});
