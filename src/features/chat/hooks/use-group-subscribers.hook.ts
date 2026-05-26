import { useEffect, useState } from "react";
import WKSDK, { type Channel, type Subscriber } from "wukongimjssdk";
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
 * - 子区 ChannelTypeCommunityTopic 走父群:SDK 的 getSubscribes 不会自动解析
 *   子区 → 父群,这里显式 parse,用父群 channel 拉成员(对齐 K-1 syncSubscribers
 *   的 thread→parent 逻辑,保证 cache key 一致)
 *
 * 用途:Composer @mention 候选 / 群管理面板 / @某人快捷搜索。
 *
 * 注意:enabled === false 时不订阅、不拉,返回空数组(私聊不需要群成员)。
 */
export function useGroupSubscribers(channel: Channel, enabled: boolean): Subscriber[] {
  const effectiveChannel = useEffectiveGroupChannel(channel);
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

/**
 * 子区 → 父群解析。返回稳定的 Channel(同输入永远同输出),用作 useEffect 依赖项;
 * 私聊 / 群本身直接返回原 channel。
 */
function useEffectiveGroupChannel(channel: Channel): Channel | null {
  if (channel.channelType !== CHANNEL_TYPE_THREAD) return channel;
  const parsed = parseThreadChannelId(channel.channelID);
  if (!parsed) return null;
  // 不 new Channel(...) — SDK 会用 channelManager 的 key 比对,而 syncSubscribes /
  // getSubscribes 内部按 channelID/channelType 字符串比,这里直接 fabricate 个对象
  return {
    channelID: parsed.groupNo,
    channelType: 2, // ChannelTypeGroup
    getChannelKey: () => `${parsed.groupNo}-2`,
  } as Channel;
}
