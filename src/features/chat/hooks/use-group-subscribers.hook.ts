import { useEffect, useMemo, useState } from "react";
import WKSDK, { Channel, ChannelTypeGroup, type Subscriber } from "wukongimjssdk";
import { parseThreadChannelId } from "@/features/base/im/parse-thread-channel-id";

/** ChannelType 7 = ChannelTypeCommunityTopic;SDK 未导出常量。 */
const CHANNEL_TYPE_THREAD = 7;

/**
 * 当前群(或子区父群)的成员订阅列表 hook。
 *
 * - 进入时主动 syncSubscribes(channel) 触发 K-1 注册的 syncSubscribersCallback
 *   把成员拉到 SDK channelManager.subscribeCacheMap
 * - addSubscriberChangeListener 监听成员变化(同步完成 / 增删成员都会触发),
 *   收到通知后 setState 重渲
 * - 子区(ChannelTypeCommunityTopic)走父群:SDK getSubscribes 不会自动解析子区→父群,
 *   这里显式 parse 出 parentGroupNo 用 `new Channel` 实例化父群 channel(SDK 内部
 *   subscribeCacheMap 用 Channel 实例 key 比对,fabricate 字面量对象会命中不到)
 *
 * 用途:Composer @mention 候选 / 群管理面板 / @某人快捷搜索。
 *
 * 注意:enabled === false 时不订阅、不拉,返回空数组(私聊不需要群成员)。
 */
export function useGroupSubscribers(channel: Channel, enabled: boolean): Subscriber[] {
  // 通过 useMemo 把同一组 channelID/channelType 映射到稳定 Channel 实例:
  // - 群 / 私聊:返回原 channel 实例(stable by reference)
  // - 子区:parse 父群 ID 后 new Channel(groupNo, ChannelTypeGroup) 用真实 SDK 实例
  // 依赖项用原 channel 的 ID + type 字符串,避免 channel 引用每次渲染变化导致重建
  const effectiveChannel = useMemo(() => {
    if (channel.channelType !== CHANNEL_TYPE_THREAD) return channel;
    const parsed = parseThreadChannelId(channel.channelID);
    if (!parsed) return null;
    return new Channel(parsed.groupNo, ChannelTypeGroup);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel.channelID, channel.channelType]);

  const [members, setMembers] = useState<Subscriber[]>(() =>
    enabled && effectiveChannel
      ? (WKSDK.shared().channelManager.getSubscribes(effectiveChannel) ?? [])
      : [],
  );

  useEffect(() => {
    if (!enabled || !effectiveChannel) {
      setMembers([]);
      return;
    }
    const cm = WKSDK.shared().channelManager;
    // 立刻读一次缓存(可能 channel-setting 提前同步过)
    setMembers(cm.getSubscribes(effectiveChannel) ?? []);
    // 主动触发同步;syncSubscribes 完成时 SDK 自己会 notifySubscriberChange
    void cm.syncSubscribes(effectiveChannel);

    const listener = (ch: Channel) => {
      if (
        ch.channelID === effectiveChannel.channelID &&
        ch.channelType === effectiveChannel.channelType
      ) {
        setMembers(cm.getSubscribes(effectiveChannel) ?? []);
      }
    };
    cm.addSubscriberChangeListener(listener);
    return () => {
      cm.removeSubscriberChangeListener(listener);
    };
  }, [effectiveChannel, enabled]);

  return members;
}
