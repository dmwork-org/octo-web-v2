import { useCallback, useMemo, useState } from "react";

/**
 * useStackView — modal/drawer 内做轻量栈式 push 子视图(对齐老仓 RoutePage push 机制)。
 *
 * **Phase E(MeInfo 1:1 复刻)用**:目前先建骨架,API 跟老仓 RouteContext push/pop 对齐;
 * 这一轮不消费,Phase B/C/D 用不到。
 *
 * **用法**:
 * ```tsx
 * type View = "root" | "name-edit" | "qrcode" | "sex" | "persona";
 * const stack = useStackView<View>("root");
 *
 * // header:
 * //   depth=0 显 close X(onClose)
 * //   depth>0 显 ← 返回(stack.pop)
 *
 * stack.push("name-edit");  // 进入二级页
 * stack.pop();              // 返回上层
 * stack.popToRoot();        // 直接回到根
 * ```
 *
 * **设计原则**:
 * - 只管栈状态,不管路由/动画/header 渲染(由调用方决定 UI)
 * - 栈顶元素 = `current`;`depth` = 栈深(0 = 根)
 * - 不支持携带 payload(若需要,push 前用 useState 暂存,或上层把 token 编码到 View 类型里)
 */
export interface StackView<T extends string> {
  /** 栈顶视图 token */
  current: T;
  /** 栈深(0 = 根,>0 = 子视图层级) */
  depth: number;
  /** push 子视图 */
  push: (view: T) => void;
  /** 回上一层(栈深 0 时无效) */
  pop: () => void;
  /** 一次清空回根 */
  popToRoot: () => void;
}

export function useStackView<T extends string>(root: T): StackView<T> {
  const [stack, setStack] = useState<T[]>([root]);

  const push = useCallback((view: T) => setStack((s) => [...s, view]), []);
  const pop = useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)), []);
  const popToRoot = useCallback(() => setStack((s) => (s.length > 1 ? [s[0]!] : s)), []);

  return useMemo(
    () => ({
      current: stack[stack.length - 1]!,
      depth: stack.length - 1,
      push,
      pop,
      popToRoot,
    }),
    [stack, push, pop, popToRoot],
  );
}
