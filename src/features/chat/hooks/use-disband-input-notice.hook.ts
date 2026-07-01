import { useMemo } from "react";
import type { Channel } from "wukongimjssdk";
import { useT } from "@/lib/i18n/use-t";
import { useChannelInfoTick } from "@/features/chat/hooks/use-channel-info-tick.hook";
import { isConversationDisbanded } from "@/features/chat/lib/group-disband";

/**
 * 已解散群/子区 composer 顶部只读提示文案(仿 use-archived-thread-input-notice)。
 *
 * 群被解散后(企业微信式只读归档),用户进 composer 给「群聊已解散」提示并置灰发送。
 * 覆盖群聊与子区(子区随父群解散而只读,见 isConversationDisbanded)。
 *
 * - 非解散会话 → undefined,不显 notice
 * - status === Disband → 返回提示文案
 *
 * `useChannelInfoTick` 监听 SDK channelInfo 推送 — syncGroupDisbandState 的
 * notifyListeners 经此驱动本 hook 重算,composer notice 即时出现。
 */
export function useDisbandInputNotice(channel: Channel | null): string | undefined {
  const tt = useT();
  const tick = useChannelInfoTick();
  return useMemo(() => {
    if (!channel) return undefined;
    if (!isConversationDisbanded(channel)) return undefined;
    return tt("channelSetting.disbandedReadonly");
    // tick 触发 channelInfo 变化时重算
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, tick, tt]);
}
