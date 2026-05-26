import { useEffect, useState } from "react";

/**
 * 右侧抽屉滑入动画(对齐旧 dmworkbase ChannelSetting transform: translate3d(100vw,0,0)→0):
 *
 * open 翻转后下一帧把 entered 置 true,触发 Tailwind translate-x-full → translate-x-0
 * 与 opacity 0 → 100 的 CSS transition;close 时立刻 reset 让出场动画也走起来。
 *
 * 抽屉壳模板复用方:channel-setting / channel-members / group-avatar / group-qrcode /
 * group-md / group-management。
 */
export function useDrawerEnterTransition(open: boolean): boolean {
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, [open]);
  return entered;
}
