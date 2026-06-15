import WKSDK, { Channel, ChannelTypeGroup, ChannelTypePerson, type Message } from "wukongimjssdk";
import { MessageContentTypeConst } from "@/features/base/im/content-types";
import { parseThreadChannelId } from "@/features/base/im/parse-thread-channel-id";

/** ChannelTypeCommunityTopic(子区) = 5,成员昵称继承父群。 */
const CHANNEL_TYPE_THREAD = 5;

export function effectiveFromUID(message: Message): string {
  const contentType = (message.content as { contentType?: number } | undefined)?.contentType;
  if (contentType === MessageContentTypeConst.threadCreated) {
    const c = message.content as { from_uid?: string } | undefined;
    if (c?.from_uid) return c.from_uid;
  }
  return message.fromUID;
}

export function senderSubscribersChannel(channel: Channel): Channel | null {
  if (channel.channelType === ChannelTypeGroup) return channel;
  if (channel.channelType === CHANNEL_TYPE_THREAD) {
    const parsed = parseThreadChannelId(channel.channelID);
    if (parsed) return new Channel(parsed.groupNo, ChannelTypeGroup);
  }
  return null;
}

export function senderDisplay(message: Message): string {
  const contentType = (message.content as { contentType?: number } | undefined)?.contentType;
  if (contentType === MessageContentTypeConst.threadCreated) {
    const c = message.content as { from_name?: string } | undefined;
    if (c?.from_name) return c.from_name;
  }

  const uid = effectiveFromUID(message);
  const subscribersChannel = senderSubscribersChannel(message.channel);
  if (subscribersChannel) {
    const subscriber = WKSDK.shared()
      .channelManager.getSubscribes(subscribersChannel)
      ?.find((s) => s.uid === uid);
    const groupNickname = subscriber?.remark || subscriber?.name;
    if (groupNickname) return groupNickname;
  }

  const personChannelInfo = WKSDK.shared().channelManager.getChannelInfo(
    new Channel(uid, ChannelTypePerson),
  );
  return personChannelInfo?.title || uid;
}
