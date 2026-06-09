import { useState, useEffect } from "react";
import WKSDK, { Channel, type ChannelInfo } from "wukongimjssdk";

/**
 * 通过 WKSDK 实时反查群/频道名称。
 *
 * 优先级: SDK 缓存命中 → 异步 fetch → 空串(上层 fallback)
 * 群改名后通过 channelManager listener 自动更新。
 */
export function useChannelName(
  channelId: string | undefined | null,
  channelType: number | undefined | null,
): string {
  const [name, setName] = useState<string>(() => {
    if (!channelId || !channelType) return "";
    const info = WKSDK.shared().channelManager.getChannelInfo(new Channel(channelId, channelType));
    return info?.title || "";
  });

  useEffect(() => {
    if (!channelId || !channelType) {
      setName("");
      return;
    }
    let aborted = false;

    const channel = new Channel(channelId, channelType);
    const cached = WKSDK.shared().channelManager.getChannelInfo(channel);
    if (cached?.title) setName(cached.title);

    const listener = (channelInfo: ChannelInfo) => {
      if (
        !aborted &&
        channelInfo.channel.channelID === channelId &&
        channelInfo.channel.channelType === channelType
      ) {
        setName(channelInfo.title || "");
      }
    };
    WKSDK.shared().channelManager.addListener(listener);

    if (!cached?.title) {
      WKSDK.shared()
        .channelManager.fetchChannelInfo(channel)
        .catch(() => {
          // fetch 失败不 fallback 到 channelId，保持空串让上层决定
        });
    }

    return () => {
      aborted = true;
      WKSDK.shared().channelManager.removeListener(listener);
    };
  }, [channelId, channelType]);

  return name;
}
