import { useMemo } from "react";
import WKSDK, { type Channel } from "wukongimjssdk";
import { useT } from "@/lib/i18n/use-t";
import { useChannelInfoTick } from "@/features/chat/hooks/use-channel-info-tick.hook";
import { THREAD_STATUS_ARCHIVED } from "@/features/chat/lib/thread-status";

/** ChannelTypeCommunityTopic = 5(SDK 未导出常量,直接 number 比对避免引入 enum)。 */
const CHANNEL_TYPE_THREAD = 5;

/**
 * 已归档子区 composer 顶部提示文案(对齐上游 23b59a41 archivedInputNotice):
 * 子区被归档后用户进 composer 输入,提示「发消息后会重新激活」— 给用户预期。
 *
 * 已被 thread-list-panel 内嵌 detail view 用过(直接 inline `thread.status` 判定);
 * 主区域 chat-main 也需要(完整视图打开归档子区时,issue #113)。本 hook 只看
 * `channelInfo.orgData.thread.status`,跟 SDK conv 同源,确保两处行为一致。
 *
 * - 非子区(channelType ≠ 5)→ undefined,Composer 不显 notice
 * - status 未加载 / 缺字段 → undefined(fail-open,跟 isArchivedThread 一致)
 * - status === Archived → 返回提示文案
 *
 * `useChannelInfoTick` 监听 SDK channelInfo 推送 — 子区归档/恢复后 channelInfo
 * 重新派发,本 hook 重算返回值,Composer notice 即时刷新。
 */
export function useArchivedThreadInputNotice(channel: Channel | null): string | undefined {
  const tt = useT();
  const tick = useChannelInfoTick();
  return useMemo(() => {
    if (!channel || channel.channelType !== CHANNEL_TYPE_THREAD) return undefined;
    const info = WKSDK.shared().channelManager.getChannelInfo(channel);
    const orgData = info?.orgData as { thread?: { status?: number } } | undefined;
    if (orgData?.thread?.status !== THREAD_STATUS_ARCHIVED) return undefined;
    return tt("threadPanel.archivedInputNotice");
    // tick 触发 channelInfo 变化时重算
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, tick, tt]);
}
