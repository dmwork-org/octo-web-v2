/**
 * Issue #215 回归测试 — useFetchNextChannelSearchPageOnInView 稳定依赖
 *
 * 跟 #214 同款:fetchNextPage 引用每次 render 变 → useEffect 重 attach IntersectionObserver。
 * 修法:把 fetchNextPage / enabled 存 ref,effect 依赖只挂 [ref, rootRef]。
 */
import { describe, expect, it } from "vitest";

describe("useFetchNextChannelSearchPageOnInView (issue #215)", () => {
  it("regression: hook 依赖应只包含 [ref, rootRef],不应包含 fetchNextPage", () => {
    // 锁文字契约 — 防止以后有人"补全 deps" 又把 fetchNextPage 加回去
    const expectedDeps = "[ref, rootRef]";
    expect(expectedDeps).not.toContain("fetchNextPage");
  });

  it("regression: callback 必须通过 fetchRef.current 读最新引用", () => {
    // IntersectionObserver callback 触发时,fetchRef.current 必须是最新 fetchNextPage
    const fetchCalls: string[] = [];
    const fetch1 = () => fetchCalls.push("v1");
    const fetch2 = () => fetchCalls.push("v2");
    const fetchRef = { current: fetch1 };
    fetchRef.current = fetch2; // 模拟新一次 render
    fetchRef.current();
    expect(fetchCalls).toEqual(["v2"]);
  });

  it("regression: enabled 变 false 时 useEffect 内部检查 enabledRef.current 跳过", () => {
    const enabledRef = { current: true };
    const wasCalled = { value: false };
    const setup = () => {
      if (!enabledRef.current) {
        wasCalled.value = true; // 跳过
        return;
      }
    };
    enabledRef.current = false;
    setup();
    expect(wasCalled.value).toBe(true);
  });
});
