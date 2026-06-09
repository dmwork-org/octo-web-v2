import WKSDK, { Channel, ChannelTypeGroup, ChannelTypePerson, type Message } from "wukongimjssdk";
import { chatReplyActions } from "@/features/chat/stores/chat-reply";
import { chatMentionRequestActions } from "@/features/chat/stores/chat-mention-request";
import { parseThreadChannelId } from "@/features/base/im/parse-thread-channel-id";

/** ChannelTypeCommunityTopic(子区) = 5,thread 角色继承父群。 */
const CHANNEL_TYPE_COMMUNITY_TOPIC = 5;

/**
 * 引用消息 + 群聊自动 @(对齐老仓 Conversation/index.tsx:1028-1040 reply +
 * 474-485 addReplyMention):
 *
 *   - 群/thread + 非自己消息 → 自动 @ 源消息发送者
 *   - 私聊 / 引用自己消息 → 仅 set reply,不 @(对齐上游 ff46fa58:
 *     addReplyMention 在 ChannelTypePerson 时直接返回)
 *
 * @label 取**昵称**而非备注 — 取 subscriber.name(用户在该群/系统的名字),
 * 不取 subscriber.remark(他人对该用户起的备注),避免 "@ 我自己起的备注"
 * 发出去后对方看到不知所云。
 *
 * caller(右键菜单 / file-preview reply 按钮等)统一走这个 helper,避免不对称。
 */
export function replyToMessage(channel: Channel, message: Message, myUid: string | null): void {
  chatReplyActions.set(channel, message);
  if (!myUid) return;
  if (message.fromUID === myUid) return;
  if (channel.channelType === ChannelTypePerson) return;
  const label = lookupNicknameLabel(channel, message.fromUID);
  chatMentionRequestActions.request(channel, { uid: message.fromUID, label });
}

/**
 * uid → 昵称(group subscriber.name 优先;不取 remark)。
 *
 * 查找顺序:
 *   1. 群/thread 父群 subscribers.find(s => s.uid === uid).name
 *   2. Person channelInfo.orgData.name(后端全局昵称)
 *   3. uid 兜底(防止 @ 空字符串)
 *
 * **故意不取**:
 *   - subscriber.remark / channelInfo.orgData.remark / channelInfo.title
 *     (后两者在 SDK 里通常 = remark || name,会被备注污染)
 */
function lookupNicknameLabel(channel: Channel, uid: string): string {
  const subscribersChannel = resolveSubscribersChannel(channel);
  if (subscribersChannel) {
    const sub = WKSDK.shared()
      .channelManager.getSubscribes(subscribersChannel)
      ?.find((s) => s.uid === uid);
    if (sub?.name) return sub.name;
  }
  const info = WKSDK.shared().channelManager.getChannelInfo(new Channel(uid, ChannelTypePerson));
  const orgName = (info?.orgData as { name?: string } | undefined)?.name;
  if (orgName) return orgName;
  return uid;
}

/** group channel → 自身;thread channel → 父群(子区成员从未同步,角色/昵称在父群)。 */
function resolveSubscribersChannel(channel: Channel): Channel | null {
  if (channel.channelType === ChannelTypeGroup) return channel;
  if (channel.channelType === CHANNEL_TYPE_COMMUNITY_TOPIC) {
    const parsed = parseThreadChannelId(channel.channelID);
    if (parsed?.groupNo) return new Channel(parsed.groupNo, ChannelTypeGroup);
  }
  return null;
}
