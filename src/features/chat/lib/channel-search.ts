import { Channel, ChannelTypeGroup, ChannelTypePerson } from "wukongimjssdk";

/** ChannelType 5 = ChannelTypeCommunityTopic(子区),SDK 未导出常量。 */
export const CHANNEL_TYPE_THREAD = 5;

export function supportsChannelSearch(channel?: Channel | null): boolean {
  if (!channel) return false;
  return (
    channel.channelType === ChannelTypeGroup ||
    channel.channelType === ChannelTypePerson ||
    channel.channelType === CHANNEL_TYPE_THREAD
  );
}
