import { useEffect, useState } from "react";
import type { Channel } from "wukongimjssdk";
import {
  type TypingInfo,
  type TypingListener,
  TypingManager,
} from "@/features/chat/services/typing-manager";

/**
 * Channel typing 状态 → React state(命名 hook 满足 no-useeffect-in-component)。
 *
 * - 订阅 TypingManager.addListener,channel 匹配时同步 typing info
 * - typing 持续中 → 返回 {fromUID, fromName};无 typing → 返回 null
 * - channel 切换 / unmount → removeListener
 * - 挂载时立即读一次当前状态(可能 typing 已在 channel 切换前注册)
 */
export function useTypingForChannel(channel: Channel | null): TypingInfo | null {
  const [info, setInfo] = useState<TypingInfo | null>(() =>
    channel ? TypingManager.getTyping(channel) : null,
  );

  useEffect(() => {
    if (!channel) {
      setInfo(null);
      return;
    }
    setInfo(TypingManager.getTyping(channel));
    const listener: TypingListener = (ch, _add) => {
      if (!ch.isEqual(channel)) return;
      setInfo(TypingManager.getTyping(channel));
    };
    TypingManager.addListener(listener);
    return () => TypingManager.removeListener(listener);
  }, [channel]);

  return info;
}
