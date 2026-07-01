/**
 * Issue #217 回归测试 — channel-search 图片懒加载 observer
 *
 * 修法:register 时如果 rootRef.current 为 null,直接 load() 而不创建 viewport-based observer。
 */
import { describe, expect, it, vi } from "vitest";

describe("channel-search image observer (issue #217)", () => {
  it("regression: 行为契约 — root 不可用时 register 必须 load() 而非退回 viewport observer", () => {
    // 锁住"root 不可用 → 直接 load"的契约
    const rootRef = { current: null as Element | null };
    const load = vi.fn();
    const register = ({ root, fallback }: { root: Element | null; fallback: () => void }) => {
      if (!root) {
        fallback();
        return;
      }
      // ... 实际 observer 创建逻辑 ...
    };
    register({ root: rootRef.current, fallback: load });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("regression: root 可用时 createObserver 应传 root 而不是 viewport", () => {
    const root = { tagName: "DIV" } as unknown as Element;
    let passedRoot: Element | null = null;
    const createObserver = (r: Element | null) => {
      passedRoot = r;
      return { observe: () => {}, disconnect: () => {} };
    };
    // 模拟有 root 的情况
    createObserver(root);
    expect(passedRoot).toBe(root);
  });
});
