import { useState } from "react";
import WKSDK, { type Channel, ChannelTypePerson, ChannelTypeGroup } from "wukongimjssdk";
import { useStore } from "@tanstack/react-store";
import { endpointStore } from "@/features/base/stores/endpoint";

interface ChannelAvatarProps {
  channel: Channel;
  /** 容器尺寸 px,默认 32。 */
  size?: number;
  /** 显式 title fallback(首字母占位时使用)。 */
  title?: string;
}

/**
 * 频道头像(对应旧 WKApp.shared.avatarChannel):
 * - channelInfo.logo 优先(若以 http/data: 开头直接用,否则拼 baseURL)
 * - fallback:Person → /users/{uid}/avatar;Group → /groups/{id}/avatar
 * - 加载失败 fallback 显示首字母
 *
 * 视觉:
 * - DM(ChannelTypePerson):圆形
 * - Group / 其他:rounded-md(6px)
 *
 * P3-C19 加上传头像 + 缓存 tag 防图片缓存失效。
 */
export function ChannelAvatar({ channel, size = 32, title }: ChannelAvatarProps) {
  const baseURL = useStore(endpointStore, (s) => s.baseURL);
  const channelInfo = WKSDK.shared().channelManager.getChannelInfo(channel);
  const [failed, setFailed] = useState(false);

  const isPerson = channel.channelType === ChannelTypePerson;
  const isGroup = channel.channelType === ChannelTypeGroup;
  const rounded = isPerson ? "rounded-full" : "rounded-md";

  const displayTitle = title ?? channelInfo?.title ?? channel.channelID;
  const initial = (displayTitle || "?").slice(0, 1).toUpperCase();

  const url = (() => {
    const logo = channelInfo?.logo;
    if (logo) {
      if (logo.startsWith("data:") || logo.startsWith("http://") || logo.startsWith("https://")) {
        return logo;
      }
      // 相对路径 + baseURL
      return `${baseURL}/${logo.replace(/^\/+/, "")}`;
    }
    if (isPerson) return `${baseURL}/users/${channel.channelID}/avatar`;
    if (isGroup) return `${baseURL}/groups/${channel.channelID}/avatar`;
    return "";
  })();

  if (!url || failed) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center ${rounded} bg-bg-elevated font-medium text-text-secondary`}
        style={{ width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.4)) }}
        aria-label={displayTitle}
      >
        {initial}
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={displayTitle}
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className={`shrink-0 ${rounded} bg-bg-elevated object-cover`}
      style={{ width: size, height: size }}
    />
  );
}
