import { describe, expect, it } from "vitest";
import { isNearBottomForNewer, isNearTopForHistory } from "./history-scroll";

describe("history scroll trigger thresholds", () => {
  it("loads earlier and newer messages before the viewport reaches the edge", () => {
    expect(isNearTopForHistory(250)).toBe(true);
    expect(isNearTopForHistory(251)).toBe(false);

    const el = { scrollHeight: 1500, scrollTop: 500, clientHeight: 200 } as HTMLElement;
    expect(isNearBottomForNewer(el)).toBe(true);
    el.scrollTop = 499;
    expect(isNearBottomForNewer(el)).toBe(false);
  });
});
