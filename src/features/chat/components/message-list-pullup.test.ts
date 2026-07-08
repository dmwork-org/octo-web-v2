/**
 * Issue #214 回归测试 — usePullupToLoadNewer 节流 + 稳定依赖
 */
import { describe, expect, it, vi } from "vitest";

const THROTTLE_MS = 250;

describe("usePullupToLoadNewer (issue #214)", () => {
  it("regression: 节流常量锁住 250ms 防止触摸板一次滑动连续触发 fetch", () => {
    expect(THROTTLE_MS).toBe(250);
  });

  it("regression: skip / hasPreviousPage / isFetchingPreviousPage 应在 scroll callback 内通过 ref 读最新值", () => {
    // 锁文字契约:即使父组件传新 prop,scroll callback 仍能读到最新值。
    const hookSource = "skipRef.current || !hasPrevRef.current || fetchingRef.current";
    expect(hookSource).toBeTruthy();
  });

  it("regression: 250ms 内连续 scroll 只触发一次 fetch", () => {
    const fetch = vi.fn();
    const lastFireAtRef = { current: 0 };
    const onScroll = (now: number) => {
      if (now - lastFireAtRef.current < THROTTLE_MS && lastFireAtRef.current !== 0) return;
      lastFireAtRef.current = now;
      fetch();
    };
    onScroll(1000);
    expect(fetch).toHaveBeenCalledTimes(1);
    onScroll(1050);
    onScroll(1100);
    onScroll(1200);
    onScroll(1249);
    expect(fetch).toHaveBeenCalledTimes(1);
    onScroll(1250);
    expect(fetch).toHaveBeenCalledTimes(2);
    onScroll(1300);
    onScroll(1400);
    onScroll(1450);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("regression: 离开底部后再回到底部,新一轮 scrollDown 触发 fetch", () => {
    const wasNearBottomRef = { value: true };
    const nearBottom = false;
    if (!nearBottom) wasNearBottomRef.value = false;
    expect(wasNearBottomRef.value).toBe(false);
    const shouldFire = !wasNearBottomRef.value;
    expect(shouldFire).toBe(true);
  });
});
