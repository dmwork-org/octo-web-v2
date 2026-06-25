import WKSDK, { Channel, ChannelTypeGroup, ChannelTypePerson, type Message } from "wukongimjssdk";
import { MessageContentTypeConst } from "@/features/base/im/content-types";
import { parseThreadChannelId } from "@/features/base/im/parse-thread-channel-id";
import { spaceStore } from "@/features/base/stores/space";

/** ChannelTypeCommunityTopic(子区) = 5,成员昵称继承父群。 */
const CHANNEL_TYPE_THREAD = 5;

type ExternalSenderFields = {
  from_home_space_id?: string;
  from_home_space_name?: string;
  from_is_external?: number;
  from_source_space_name?: string;
};

type ExternalOrgData = {
  home_space_id?: string;
  home_space_name?: string;
  is_external?: number;
  source_space_name?: string;
};

type SenderSubscriber = {
  orgData?: ExternalOrgData;
};

function normalizeSpaceName(value: string | undefined): string {
  return value?.trim() ?? "";
}

function resolveExternalSpaceName(input: {
  homeSpaceId?: string;
  homeSpaceName?: string;
  isExternalLegacy?: number;
  sourceSpaceNameLegacy?: string;
}): string {
  const homeSpaceId = input.homeSpaceId?.trim();
  if (homeSpaceId) {
    const currentSpaceId = spaceStore.state.spaceId;
    return !currentSpaceId || homeSpaceId !== currentSpaceId
      ? normalizeSpaceName(input.homeSpaceName)
      : "";
  }

  return input.isExternalLegacy === 1 ? normalizeSpaceName(input.sourceSpaceNameLegacy) : "";
}

function messageExternalSpaceName(message: Message): string {
  const fields = message as Message & ExternalSenderFields;
  return resolveExternalSpaceName({
    homeSpaceId: fields.from_home_space_id,
    homeSpaceName: fields.from_home_space_name,
    isExternalLegacy: fields.from_is_external,
    sourceSpaceNameLegacy: fields.from_source_space_name,
  });
}

function subscriberExternalSpaceName(subscriber: SenderSubscriber | undefined): string {
  const orgData = subscriber?.orgData;
  return resolveExternalSpaceName({
    homeSpaceId: orgData?.home_space_id,
    homeSpaceName: orgData?.home_space_name,
    isExternalLegacy: orgData?.is_external,
    sourceSpaceNameLegacy: orgData?.source_space_name,
  });
}

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

export function senderExternalSpaceName(message: Message): string {
  const messageSpaceName = messageExternalSpaceName(message);
  if (messageSpaceName) return messageSpaceName;

  const subscribersChannel = senderSubscribersChannel(message.channel);
  if (!subscribersChannel) return "";

  const uid = effectiveFromUID(message);
  const subscriber = WKSDK.shared()
    .channelManager.getSubscribes(subscribersChannel)
    ?.find((s) => s.uid === uid);
  return subscriberExternalSpaceName(subscriber);
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
