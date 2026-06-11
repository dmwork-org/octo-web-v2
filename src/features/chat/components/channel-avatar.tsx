import { useEffect, useRef, useState } from "react";
import WKSDK, { type Channel, ChannelTypePerson, ChannelTypeGroup } from "wukongimjssdk";
import { useStore } from "@tanstack/react-store";
import { endpointStore } from "@/features/base/stores/endpoint";
import { avatarVersionStore } from "@/features/base/stores/avatar-version";
import { useChannelInfoTick } from "@/features/chat/hooks/use-channel-info-tick.hook";
import { tryFetchChannelInfo } from "@/features/chat/lib/live-channel-title";

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
 * **风暴防护**(issue #84):走 `tryFetchChannelInfo`(模块级 attempted Set,
 * Space 切换由 clearFetchedTitleCache 清),避免两波 mount 之间 SDK
 * `fetchChannelInfo` 重复发 HTTP(SDK 内部只防 in-flight,不防 cache 命中
 * 后的二次调用)。同一 channel 整会话期最多 fetch 1 次。
 *
 * 抽出命名 hook 满足 no-useeffect-in-component。
 */
function useFetchChannelInfoIfMissing(channel: Channel, hasInfo: boolean) {
  useEffect(() => {
    if (hasInfo) return;
    tryFetchChannelInfo(channel);
  }, [channel, hasInfo]);
}

/** url 变化时重置失败状态:logo URL 变了让 `<img>` 再试一次,同时取消 grace timer。 */
function useResetFailedOnUrlChange(
  url: string,
  setSoftFailed: (v: boolean) => void,
  setHardFailed: (v: boolean) => void,
  timerRef: React.MutableRefObject<number | null>,
) {
  useEffect(() => {
    setSoftFailed(false);
    setHardFailed(false);
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, [url, setSoftFailed, setHardFailed, timerRef]);
}

function withVersion(url: string, version: number): string {
  if (!url || version <= 0 || url.startsWith("data:")) return url;
  return `${url}${url.includes("?") ? "&" : "?"}v=${version}`;
}

/**
 * Group fallback URL — 对齐老仓 App.tsx avatarChannel L959
 * `${baseURL}groups/{channelID}/avatar`。后端服务总是返回头像(自定义图或默认图),
 * 客户端不需要等 channelInfo.logo 字段就能拿到群头像。
 *
 * 死锁防护:URL 必带 `?v={avatarVersion}` — createGroup onSuccess 主动 bump,
 * 让浏览器视为新 URL 重 GET,绕过潜在的旧 404 cache。
 */
function groupFallbackUrl(baseURL: string, channelID: string): string {
  if (!baseURL || !channelID) return "";
  return `${baseURL}/groups/${channelID}/avatar`;
}

/**
 * 频道头像(对应旧 WKApp.shared.avatarChannel)。
 *
 * **URL 选取**(优先级):
 *   1. `channelInfo.logo` 非空 → 走 logo URL(http/https/data 直接用,相对路径拼 baseURL)
 *   2. Group fallback:`${baseURL}/groups/{channelID}/avatar`(对齐老仓,服务端总返头像)
 *   3. 否则首字母占位
 *
 * **加载失败 2 段降级**(issue #64 followup):新建群瞬间 fallback URL 可能命中
 * 后端尚未 ready 的窗口(404),如果立即降级到首字符,bump 后 url 变化重 GET
 * 成功会出现"缺省字符 → 头像"的视觉闪烁。改为:
 *   - **soft failed**(刚 onError):画灰块占位,无文字。等 1.5s grace period,
 *     期间若 url 变化(avatarVersion bump / channelInfo 更新)→ reset 重 GET
 *   - **hard failed**(1.5s 后还没救):退回首字符 — 用户看不到头像也能识别会话
 *
 * **死锁防护**(issue #64):用 `avatarVersion` 双管 cache busting:
 *   - createGroup onSuccess 主动 `avatarVersionActions.bump(group_no)` 让 fallback
 *     URL 带 `?v={ts}`,首次 GET 就有版本号,后端 ready 后即使是同款 path,version
 *     变化也强制重 GET
 *   - use-cmd-sync 的 groupAvatarUpdate cmd 触发 bump,继续保证 cache busting
 *
 * **channelInfo 实时同步**:useChannelInfoTick 订阅全局 channelInfo 变化,任何
 * channel info 拉到都触发 re-render → 重读 getChannelInfo 拿 logo。
 *
 * **视觉**:DM(ChannelTypePerson)圆形 / Group rounded-md(6px)。
 */
export function ChannelAvatar({ channel, size = 32, title }: ChannelAvatarProps) {
  const baseURL = useStore(endpointStore, (s) => s.baseURL);
  const avatarVersion = useStore(avatarVersionStore, (s) => {
    if (channel.channelType === ChannelTypePerson) return s.versions[channel.channelID] ?? 0;
    if (channel.channelType === ChannelTypeGroup) return s.versions[channel.channelID] ?? 0;
    return 0;
  });
  useChannelInfoTick();
  const channelInfo = WKSDK.shared().channelManager.getChannelInfo(channel);
  const [softFailed, setSoftFailed] = useState(false);
  const [hardFailed, setHardFailed] = useState(false);
  const graceTimerRef = useRef<number | null>(null);
  useFetchChannelInfoIfMissing(channel, !!channelInfo);

  const isPerson = channel.channelType === ChannelTypePerson;
  const isGroup = channel.channelType === ChannelTypeGroup;
  const rounded = isPerson ? "rounded-full" : "rounded-md";

  const displayTitle = title ?? channelInfo?.title ?? channel.channelID;
  const initial = (displayTitle || "?").slice(0, 1).toUpperCase();

  const logo = channelInfo?.logo;
  const rawUrl = logo
    ? logo.startsWith("data:") || logo.startsWith("http://") || logo.startsWith("https://")
      ? logo
      : `${baseURL}/${logo.replace(/^\/+/, "")}`
    : isGroup
      ? groupFallbackUrl(baseURL, channel.channelID)
      : "";
  const url = withVersion(rawUrl, avatarVersion);

  useResetFailedOnUrlChange(url, setSoftFailed, setHardFailed, graceTimerRef);

  const onImgError = () => {
    setSoftFailed(true);
    if (graceTimerRef.current != null) window.clearTimeout(graceTimerRef.current);
    graceTimerRef.current = window.setTimeout(() => {
      setHardFailed(true);
    }, 1500);
  };

  // URL 完全空(person 无 logo)或硬性失败 → 首字符 fallback(最终态)
  if (!url || hardFailed) {
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

  // 软性失败(刚 onError,grace period 内)→ 灰块占位,等 url 变化 reset 重 GET
  if (softFailed) {
    return (
      <div
        className={`shrink-0 ${rounded} bg-bg-elevated`}
        style={{ width: size, height: size }}
        aria-label={displayTitle}
      />
    );
  }

  return (
    <img
      src={url}
      alt={displayTitle}
      width={size}
      height={size}
      onError={onImgError}
      className={`shrink-0 ${rounded} bg-bg-elevated object-cover`}
      style={{ width: size, height: size }}
    />
  );
}
