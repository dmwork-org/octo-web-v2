import { ChannelTypeGroup } from "wukongimjssdk";
import { useChannelName } from "@/features/matter/hooks/use-channel-name";
import { toParentGroupNo } from "@/features/matter/utils/channel-id";

const CHANNEL_TYPE_COMMUNITY_TOPIC = 5;

interface ChannelNameLabelProps {
  channelId: string;
  channelType: number;
  /** 后端保存的 channel_name 快照，SDK 未命中时作为 fallback */
  fallback?: string;
  /** 未加入群时模糊显示，防止群名泄漏 */
  blur?: boolean;
  /** 成员关系拉取中，显示骨架占位 */
  loading?: boolean;
}

/**
 * 三态群名标签：
 * - loading: shimmer 骨架动画
 * - blur: 模糊 + 固定占位 ████（保护隐私）
 * - clear: 实时群名（SDK 反查 > fallback > channelId 前 8 位）
 *
 * 子区 (channel_type=5): 额外反查父群名, 渲染成 "父群名/子区名"
 */
export function ChannelNameLabel({
  channelId,
  channelType,
  fallback,
  blur,
  loading,
}: ChannelNameLabelProps) {
  const live = useChannelName(channelId, channelType);

  // 子区: 额外反查父群名
  const isThread = channelType === CHANNEL_TYPE_COMMUNITY_TOPIC;
  const parentGroupNo = isThread ? toParentGroupNo(channelId, channelType) : "";
  const parentLive = useChannelName(
    isThread ? parentGroupNo : null,
    isThread ? ChannelTypeGroup : null,
  );

  if (loading) {
    return (
      <span
        className="inline-block h-4 w-16 animate-pulse rounded bg-bg-elevated"
        aria-label="加载中"
        role="presentation"
      />
    );
  }

  if (blur) {
    return (
      <span
        className="select-none blur-[2.5px] opacity-35 cursor-help"
        title="你不在该群，群名已隐藏"
        aria-label="群名已隐藏"
      >
        ████
      </span>
    );
  }

  const selfName = live || fallback || channelId.slice(0, 8);
  // 父群名解析不出来时退化为只显示子区名
  const display = isThread && parentLive ? `${parentLive}/${selfName}` : selfName;
  return <span>{display}</span>;
}
