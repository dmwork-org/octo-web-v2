import WKSDK, { Channel, ChannelTypeGroup, ChannelTypePerson } from "wukongimjssdk";
import { parseThreadChannelId } from "@/features/base/im/parse-thread-channel-id";
import {
  SourceType,
  type ChatCandidate,
  type SourceTypeValue,
} from "@/features/summary/types/summary.types";

/** ChannelType 5 = ChannelTypeCommunityTopic(子区);SDK 未导出常量,本仓 chat-header 同。 */
const CHANNEL_TYPE_THREAD = 5;

interface ChannelLike {
  channelID: string;
  channelType: number;
}

/**
 * 把 WK SDK 的 channelType(person=1 / group=2 / thread=5)映射到后端
 * `origin_channel_type` 期望的 SourceType 枚举(GROUP_CHAT=1 / THREAD=2 / DM=3)。
 *
 * **绝对不能把 channelType 直接传给后端的 origin_channel_type** —— 老仓
 * `f27fbdd2` review 评论里有过同样误推荐,会让 thread(channelType=5)被后端
 * 400 拒收。
 *
 * 不支持的 channelType 返回 null,调用方应直接 return。
 */
export function getSourceType(channel: ChannelLike): SourceTypeValue | null {
  if (channel.channelType === CHANNEL_TYPE_THREAD || parseThreadChannelId(channel.channelID)) {
    return SourceType.THREAD;
  }
  if (channel.channelType === ChannelTypeGroup) {
    return SourceType.GROUP_CHAT;
  }
  if (channel.channelType === ChannelTypePerson) {
    return SourceType.DIRECT_MESSAGE;
  }
  return null;
}

export function isSupportedChannelType(channel: ChannelLike): boolean {
  return getSourceType(channel) !== null;
}

/**
 * Channel → ChatCandidate(chat-selector 用)。读 SDK channelManager 的 cached
 * info 拿 title/member_count;没缓存时 name 回退 channelID,member_count = null。
 */
export function channelToChatCandidate(channel: ChannelLike): ChatCandidate {
  const ch = new Channel(channel.channelID, channel.channelType);
  const info = WKSDK.shared().channelManager.getChannelInfo(ch);

  let chatType: ChatCandidate["chat_type"];
  if (channel.channelType === CHANNEL_TYPE_THREAD || parseThreadChannelId(channel.channelID)) {
    chatType = "thread";
  } else if (channel.channelType === ChannelTypeGroup) {
    chatType = "group";
  } else if (channel.channelType === ChannelTypePerson) {
    chatType = "direct";
  } else {
    chatType = "group";
  }

  const memberCount = (info?.orgData as { member_count?: number } | undefined)?.member_count;

  return {
    chat_id: channel.channelID,
    chat_type: chatType,
    name: info?.title || channel.channelID,
    member_count: typeof memberCount === "number" ? memberCount : null,
  };
}
