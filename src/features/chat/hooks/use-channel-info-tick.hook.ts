import { useEffect, useState } from "react";
import WKSDK, { type ChannelInfoListener } from "wukongimjssdk";

/**
 * 监听全局 channelInfo 变化,触发 force re-render —
 * 用于 message-list 计算 `buildRenderItems` 等依赖 channelInfo.orgData
 * (如 `robot === 1` bot 判定)的派生数据。
 *
 * 旧 dmworkbase vm 用 channelInfoListener 触发 rebuildRenderItems;
 * 新仓在 React 函数组件里同款用 force counter 触发 useMemo 重算。
 *
 * **触发频率**:节流到下一帧,避免 channelInfo 批量到位时 setState 抖动。
 *
 * 返回 counter:外层 useMemo 把它放进 deps,counter 变化时强制重算。
 */
export function useChannelInfoTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let scheduled = false;
    const listener: ChannelInfoListener = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        setTick((v) => v + 1);
      });
    };
    const mgr = WKSDK.shared().channelManager;
    mgr.addListener(listener);
    return () => mgr.removeListener(listener);
  }, []);
  return tick;
}
