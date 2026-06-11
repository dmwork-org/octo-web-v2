import WKSDK, { Channel, ChannelTypeGroup, ChannelTypePerson } from "wukongimjssdk";
import { parseThreadChannelId } from "@/features/base/im/parse-thread-channel-id";
import { chatProfileActions } from "@/features/chat/stores/chat-profile";

const CHANNEL_TYPE_THREAD = 5;

function groupNoFromChannel(channel?: Channel): string | undefined {
  if (!channel || channel.channelType === ChannelTypePerson) return undefined;
  if (channel.channelType === ChannelTypeGroup) return channel.channelID;
  if (channel.channelType === CHANNEL_TYPE_THREAD) {
    return parseThreadChannelId(channel.channelID)?.groupNo;
  }
  return undefined;
}

/**
 * 按 channelInfo.orgData.robot 判 bot,dispatch 对应 action 打开 modal。
 * 给 text-renderer(mention click)/ message-row(头像 click)统一入口用。
 *
 * 抽到 lib/ 而非 views/ — fast-refresh 规则要求 view 文件只 export component。
 */
export function openChatProfile(uid: string, fromChannel?: Channel) {
  if (!uid) return;
  const info = WKSDK.shared().channelManager.getChannelInfo(new Channel(uid, ChannelTypePerson));
  const isBot = (info?.orgData as { robot?: number } | undefined)?.robot === 1;
  if (isBot) chatProfileActions.openBot(uid);
  else chatProfileActions.openUser(uid, groupNoFromChannel(fromChannel));
}
