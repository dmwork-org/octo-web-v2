import { useCallback, useEffect, useState } from "react";

/**
 * 通用下钻栈 hook(DrilldownDialog / DrilldownDrawer 共用)。
 *
 * 内部维护一个 `K[]` 栈,默认 `[rootKey]`;提供 push/back/reset 三 op:
 *   - push(key): 入栈
 *   - back():    出栈(栈深 > 1 时);depth = 1 时 no-op,关闭由外层 onClose 控制
 *   - reset():   清空回 [rootKey]
 *
 * 自动复位时机:
 *   - resetKey 变化(典型:外层切换主体,如 bot uid 切换 → 复位下钻栈)
 *   - open 翻 false(下次打开从根页开始,避免上次离开时的栈位残留)
 */
export interface DrilldownStack<K extends string> {
  current: K;
  depth: number;
  push: (key: K) => void;
  back: () => void;
  reset: () => void;
}

export function useDrilldownStack<K extends string>(
  rootKey: K,
  open: boolean,
  resetKey?: string | number | null,
): DrilldownStack<K> {
  const [stack, setStack] = useState<K[]>([rootKey]);

  useResetStackOnDeps(setStack, rootKey, resetKey);
  useResetStackOnClose(setStack, rootKey, open);

  const push = useCallback((key: K) => {
    setStack((s) => [...s, key]);
  }, []);
  const back = useCallback(() => {
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  }, []);
  const reset = useCallback(() => {
    setStack([rootKey]);
  }, [rootKey]);

  const current = stack[stack.length - 1] ?? rootKey;
  return { current, depth: stack.length, push, back, reset };
}

/** resetKey 变化时复位 stack。 */
function useResetStackOnDeps<K extends string>(
  setStack: (s: K[]) => void,
  rootKey: K,
  resetKey?: string | number | null,
): void {
  useEffect(() => {
    setStack([rootKey]);
    // setStack 是 useState 的稳定 setter,不入依赖避免无限循环
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey, rootKey]);
}

/** open 翻 false 时复位,下次打开从根页开始。 */
function useResetStackOnClose<K extends string>(
  setStack: (s: K[]) => void,
  rootKey: K,
  open: boolean,
): void {
  useEffect(() => {
    if (!open) setStack([rootKey]);
    // setStack 稳定不入依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, rootKey]);
}
