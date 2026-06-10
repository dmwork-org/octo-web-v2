import { useEffect, useState } from "react";
import WKSDK, { type Channel, ChannelTypePerson } from "wukongimjssdk";
import { useStore } from "@tanstack/react-store";
import { endpointStore } from "@/features/base/stores/endpoint";
import { avatarVersionStore } from "@/features/base/stores/avatar-version";
import { useChannelInfoTick } from "@/features/chat/hooks/use-channel-info-tick.hook";

interface ChannelAvatarProps {
  channel: Channel;
  /** 容器尺寸 px,默认 32。 */
  size?: number;
  /** 显式 title fallback(首字母占位时使用)。 */
  title?: string;
}

/**
 * cache 缺失时主动拉 channelInfo(对齐老仓 vm channelInfoMissing → fetch 兜底)。
 * 新建群:onSuccess 已 fetch 一次,这里二次保险 + 让所有 avatar 实例都成为
 * "渲染即触发 fetch" 的入口。
 *
 * 抽出命名 hook 满足 no-useeffect-in-component。
 */
function useFetchChannelInfoIfMissing(channel: Channel, hasInfo: boolean) {
  useEffect(() => {
    if (hasInfo) return;
    void WKSDK.shared().channelManager.fetchChannelInfo(channel);
  }, [channel, hasInfo]);
}

/** url 变化时重置 failed:logo URL 变了让 `<img>` 再试一次。 */
function useResetFailedOnUrlChange(url: string, setFailed: (v: boolean) => void) {
  useEffect(() => {
    setFailed(false);
  }, [url, setFailed]);
}

function withVersion(url: string, version: number): string {
  if (!url || version <= 0 || url.startsWith("data:")) return url;
  return `${url}${url.includes("?") ? "&" : "?"}v=${version}`;
}

/**
 * 频道头像(对应旧 WKApp.shared.avatarChannel)。
 *
 * **关键策略**:**不渲染 fallback URL**(`/groups/{id}/avatar`)。老版本曾用这条
 * 兜底,但有死锁:
 *   - 新建群瞬间 ConversationRow mount,channelInfo 空 → 落 fallback URL
 *   - 后端此时还没准备好 group 头像 → 404 → onError → failed=true
 *   - 浏览器 cache 404,SDK 后续拉到 channelInfo 即使 logo 字段填了同样 URL,
 *     浏览器也不会重 GET → failed 永久卡住,直到手刷
 * 现在:**无 channelInfo.logo 直接显首字母占位**,等 SDK 拉到 logo 字段非空再
 * 走 `<img>` 渲染。channelInfo 到位后 useChannelInfoTick 触发 re-render。
 *
 * **channelInfo 实时同步**:useChannelInfoTick 订阅全局 channelInfo 变化,任何
 * channel info 拉到都触发 re-render → 重读 getChannelInfo 拿 logo。
 *
 * **视觉**:DM(ChannelTypePerson)圆形 / Group rounded-md(6px)。
 */
export function ChannelAvatar({ channel, size = 32, title }: ChannelAvatarProps) {
  const baseURL = useStore(endpointStore, (s) => s.baseURL);
  const avatarVersion = useStore(avatarVersionStore, (s) =>
    channel.channelType === ChannelTypePerson ? (s.versions[channel.channelID] ?? 0) : 0,
  );
  useChannelInfoTick();
  const channelInfo = WKSDK.shared().channelManager.getChannelInfo(channel);
  const [failed, setFailed] = useState(false);
  useFetchChannelInfoIfMissing(channel, !!channelInfo);

  const isPerson = channel.channelType === ChannelTypePerson;
  const rounded = isPerson ? "rounded-full" : "rounded-md";

  const displayTitle = title ?? channelInfo?.title ?? channel.channelID;
  const initial = (displayTitle || "?").slice(0, 1).toUpperCase();

  // 只在 channelInfo.logo 非空时渲染 <img>;空就直接首字母占位
  const logo = channelInfo?.logo;
  const rawUrl = !logo
    ? ""
    : logo.startsWith("data:") || logo.startsWith("http://") || logo.startsWith("https://")
      ? logo
      : `${baseURL}/${logo.replace(/^\/+/, "")}`;
  const url = withVersion(rawUrl, avatarVersion);

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
