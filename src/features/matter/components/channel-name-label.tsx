import { useChannelName } from "@/features/matter/hooks/use-channel-name";

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
 */
export function ChannelNameLabel({
  channelId,
  channelType,
  fallback,
  blur,
  loading,
}: ChannelNameLabelProps) {
  const live = useChannelName(channelId, channelType);

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

  const display = live || fallback || channelId.slice(0, 8);
  return <span>{display}</span>;
}
