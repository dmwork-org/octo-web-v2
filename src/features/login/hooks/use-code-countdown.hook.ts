import { useEffect, useState } from "react";

/**
 * 验证码倒计时 hook(对齐老仓 LoginVM `registerCodeCountdown` / `emailCodeCountdown`
 * + setInterval 实现)。
 *
 * - 父组件:`const { count, start } = useCodeCountdown()`
 * - 触发发送后:`start(60)` 启动倒计时,每秒 -1 到 0 自动停
 * - 把 `count` 传给 `<SendCodeButton countdown={count} ... />` 用于禁用 + 显示文案
 */
export function useCodeCountdown(): {
  count: number;
  start: (seconds?: number) => void;
  reset: () => void;
} {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (count <= 0) return;
    const t = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [count]);

  return {
    count,
    start: (seconds = 60) => setCount(seconds),
    reset: () => setCount(0),
  };
}
