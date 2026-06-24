import WKSDK, { Channel, ChannelTypeGroup, ChannelTypePerson, type Message } from "wukongimjssdk";
import { chatReplyActions } from "@/features/chat/stores/chat-reply";
import { chatMentionRequestActions } from "@/features/chat/stores/chat-mention-request";
import { parseThreadChannelId } from "@/features/base/im/parse-thread-channel-id";
import { tryFetchChannelInfo } from "@/features/chat/lib/live-channel-title";

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
 * **issue #76 两个根因**:
 *   1. **channel key 错配** — WKSDK 私聊接收消息时把 `message.channel.channelID`
 *      设为**接收者 uid(我自己)**而非对端;caller(右键菜单)直接透传
 *      message.channel,导致 set 用 `自己_Person` 作 key,composer 用
 *      `对端_Person` 订阅,永远 miss → reply bar 不出现。下方 fixedChannel
 *      自我修正。
 *   2. **昵称未预热** — 私聊场景对端 channelInfo 通常没被列表/sidebar
 *      触发过 fetch,lookupNicknameLabel 兜底回 uid → reply bar 显示
 *      "回复 ada105...: ..." 而非昵称。这里 set 后主动 fetchChannelInfo,
 *      lookupNicknameLabel 加 title 兜底,composer 通过 useChannelInfoTick
 *      在 cache 到位时重渲。
 *
 * caller(右键菜单 / file-preview reply 按钮等)统一走这个 helper,避免不对称。
 */
export function replyToMessage(channel: Channel, message: Message, myUid: string | null): void {
  // 根因 1:fix channel key —— 详见函数 doc。
  const fixedChannel =
    channel.channelType === ChannelTypePerson && myUid && channel.channelID === myUid
      ? new Channel(message.fromUID, ChannelTypePerson)
      : channel;
  chatReplyActions.set(fixedChannel, message);
  // 根因 2:预热 sender channelInfo —— 详见函数 doc。
  if (message.fromUID) {
    const senderChannel = new Channel(message.fromUID, ChannelTypePerson);
    if (!WKSDK.shared().channelManager.getChannelInfo(senderChannel)) {
      tryFetchChannelInfo(senderChannel);
    }
  }
  if (!myUid) return;
  if (message.fromUID === myUid) return;
  if (fixedChannel.channelType === ChannelTypePerson) return;
  const label = lookupNicknameLabel(fixedChannel, message.fromUID);
  chatMentionRequestActions.request(fixedChannel, { uid: message.fromUID, label });
}

/**
 * uid → 昵称(group subscriber.name 优先;不取 remark)。供 reply 自动 @ 和
 * reply bar 顶部 sender 名展示共用,确保两处都不被本地备注污染。
 *
 * 查找顺序:
 *   1. 群/thread 父群 subscribers.find(s => s.uid === uid).name
 *   2. Person channelInfo.orgData.name(后端全局昵称)
 *   3. **(issue #76)** Person channelInfo.title — 私聊 reply 兜底,title 通常
 *      就是 sender remark 或 name;就算是本地备注,私聊里显示自己起的备注也合理,
 *      总好过裸 uid。群里同理 — 如果走到这一步说明前面 subscriber/orgName 都没
 *      命中(罕见),title 至少能给个 fallback
 *   4. uid 兜底(防止显示 "@"  空字符串)
 *
 * **故意不取**:subscriber.remark / orgData.remark(群场景下 "@ 我给他起的备注"
 * 发出去后对方看到不知所云)。但 channelInfo.title 在 SDK 内通常 = remark || name,
 * 群场景下走到第 3 步是 fallback,不是首选,trade-off 可接受。
 */
export function lookupNicknameLabel(channel: Channel, uid: string): string {
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
  if (info?.title) return info.title;
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
