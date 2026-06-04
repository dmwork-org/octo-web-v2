import { useEffect, useState } from "react";
import WKSDK, { type Channel, ChannelTypePerson, ChannelTypeGroup } from "wukongimjssdk";
import { useStore } from "@tanstack/react-store";
import { endpointStore } from "@/features/base/stores/endpoint";
import { useChannelInfoTick } from "@/features/chat/hooks/use-channel-info-tick.hook";

interface ChannelAvatarProps {
  channel: Channel;
  /** 容器尺寸 px,默认 32。 */
  size?: number;
  /** 显式 title fallback(首字母占位时使用)。 */
  title?: string;
}

/**
 * cache 缺失时主动调 fetchChannelInfo(对齐老仓 vm channelInfoMissing → fetch
 * 的兜底逻辑)。常用于新建群:onSuccess 已经 fetch 一次,这里二次保险 + 把
 * avatar 实例当作"任何场景下渲染 channel 时都会自动 fetch"的入口。
 *
 * 抽出命名 hook 满足 no-useeffect-in-component。
 */
function useFetchChannelInfoIfMissing(channel: Channel, hasInfo: boolean) {
  useEffect(() => {
    if (hasInfo) return;
    void WKSDK.shared().channelManager.fetchChannelInfo(channel);
  }, [channel, hasInfo]);
}

/**
 * url 变化时重置 failed:fallback URL load 失败 → failed=true 显首字母;
 * 后来 channelInfo 拉到新 logo URL,应该让 <img> 再试一次,而不是一直显首字母。
 */
function useResetFailedOnUrlChange(url: string, setFailed: (v: boolean) => void) {
  useEffect(() => {
    setFailed(false);
  }, [url, setFailed]);
}

/**
 * 频道头像(对应旧 WKApp.shared.avatarChannel):
 * - channelInfo.logo 优先(若以 http/data: 开头直接用,否则拼 baseURL)
 * - fallback:Person → /users/{uid}/avatar;Group → /groups/{id}/avatar
 * - 加载失败 fallback 显示首字母
 *
 * 视觉:DM(ChannelTypePerson)圆形 / Group rounded-md(6px)。
 *
 * **channelInfo 实时同步**(对齐老仓 channelInfoListener):
 * - 用 useChannelInfoTick 订阅 SDK 全局 channelInfo 变化,新建群 / 新拉 channel
 *   info 到位后自动 re-render(否则 cache 空时落 fallback URL → onError → 首字母,
 *   即使 SDK 后来拉到 logo 也不会重渲,需要用户刷新)
 * - cache 缺失时主动 fetchChannelInfo,防"没人调 fetch → 永远拿不到"
 */
export function ChannelAvatar({ channel, size = 32, title }: ChannelAvatarProps) {
  const baseURL = useStore(endpointStore, (s) => s.baseURL);
  // tick 变化触发 re-render → 重读 getChannelInfo 拿到新 logo;读返回值不重要,
  // 关键是把 tick 放在 hook 调用里让组件订阅
  useChannelInfoTick();
  const channelInfo = WKSDK.shared().channelManager.getChannelInfo(channel);
  const [failed, setFailed] = useState(false);

  // cache 缺失 → 主动拉(新建群 / 首次渲染都靠这个兜底)
  useFetchChannelInfoIfMissing(channel, !!channelInfo);

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

  // url 变化时重置 failed:让 <img> 用新 logo URL 再试一次
  useResetFailedOnUrlChange(url, setFailed);

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
