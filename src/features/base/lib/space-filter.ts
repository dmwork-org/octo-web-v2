import WKSDK, {
  Channel,
  ChannelTypeGroup,
  ChannelTypePerson,
  type Conversation,
  type Message,
} from "wukongimjssdk";
import { channelSpaceKey, channelSpaceMap } from "@/features/base/stores/space";
import { parseThreadChannelId } from "@/features/base/im/parse-thread-channel-id";
import { tryFetchChannelInfo } from "@/features/chat/lib/live-channel-title";

/** 子区 channel type(对齐旧 dmworkbase ChannelTypeCommunityTopic = 5)。 */
const CHANNEL_TYPE_THREAD = 5;

/**
 * 系统 Bot channelID 集合(对齐旧 dmworkbase SpaceService.SYSTEM_BOTS):
 * BotFather 这类全局单例 bot,所有 Space 都可见 channel,但**消息**按
 * `content.contentObj.space_id` 隔离。
 */
export const SYSTEM_BOTS = new Set<string>(["botfather"]);

/**
 * 判断 channel 是否归属当前 Space(1:1 对齐旧 dmworkbase
 * `Service/SpaceService.shouldSkipChannelForSpace` 的反向语义,
 * `true` = 允许显示;`false` = 应过滤掉)。
 *
 * **群聊判定**(由强到弱):
 *   1. `channelSpaceMap`(由 syncConversations / channelInfoCallback 预填) — 命中即按 owner 匹配
 *   2. SDK `channelManager.getChannelInfo(channel).orgData.space_id` —
 *      命中后**回填** channelSpaceMap 避免下次重查
 *   3. 都未命中 → **fail-close + 主动 fetch**:暂时过滤(返回 false),触发
 *      channelInfoListener 异步到位后下次 snapshot 自动加进来
 *
 * **子区**(channelType = 5):channelID = `{groupNo}____{shortId}`,属于父群
 * → 解析出 groupNo,递归走父群的群聊判定。
 *
 * **Person 私聊**:channel level 永远 allow(不归属 Space);消息/会话级别由
 * `isMessageOfSpace` / `isConversationOfSpace` 用 `contentObj.space_id` 判定。
 *
 * 入参 `spaceId = null` → 跳过过滤(无 Space 上下文,全部 allow)。
 */
export function isChannelOfSpace(channel: Channel, spaceId: string | null): boolean {
  if (!spaceId) return true;
  if (!channel?.channelID) return true;
  if (channel.channelType === ChannelTypePerson) return true;

  // 子区:解析出父群 groupNo,委托父群判定
  if (channel.channelType === CHANNEL_TYPE_THREAD) {
    const parsed = parseThreadChannelId(channel.channelID);
    if (!parsed) return true;
    const parentChannel = new Channel(parsed.groupNo, ChannelTypeGroup);
    return isChannelOfSpace(parentChannel, spaceId);
  }

  if (channel.channelType === ChannelTypeGroup) {
    const key = channelSpaceKey(channel.channelID, channel.channelType);
    const cached = channelSpaceMap.get(key);
    if (cached) return cached === spaceId;

    // fallback:从 SDK channelInfo cache 取 space_id,命中后回填
    const info = WKSDK.shared().channelManager.getChannelInfo(channel);
    const orgSpace = (info?.orgData as { space_id?: string } | undefined)?.space_id;
    if (orgSpace) {
      channelSpaceMap.set(key, orgSpace);
      return orgSpace === spaceId;
    }
    // 都未命中 → 主动 fetch(dedup,attempted set 防 listener 风暴) + fail-close
    tryFetchChannelInfo(channel);
    return false;
  }

  return true;
}

/**
 * 判断 Conversation 是否归属当前 Space(对齐旧
 * `shouldSkipPersonConversationForSpace`):
 *
 * **群聊**:走 `isChannelOfSpace`
 * **Person 私聊**:
 *   - SYSTEM_BOTS(BotFather)— channel level 永远显示,但 lastMessage 的
 *     `content.contentObj.space_id` 不匹配 → 过滤(避免其他 Space 的 Bot 消息
 *     蹦进当前列表)
 *   - 普通 Person 私聊 — lastMessage `contentObj.space_id` 存在且不匹配 → 过滤;
 *     无 space_id → 保留(旧消息兼容)
 */
export function isConversationOfSpace(conversation: Conversation, spaceId: string | null): boolean {
  if (!spaceId) return true;
  const channel = conversation.channel;
  if (!channel) return true;

  if (channel.channelType !== ChannelTypePerson) {
    return isChannelOfSpace(channel, spaceId);
  }

  // Person 私聊 — 看 lastMessage 的 contentObj.space_id
  const msgSpaceId = getMessageSpaceId(conversation.lastMessage);

  if (SYSTEM_BOTS.has(channel.channelID)) {
    // 系统 Bot:必须 space_id 匹配才显示;无 space_id 或不匹配都过滤
    return msgSpaceId === spaceId;
  }

  // 普通私聊:有 space_id 必须匹配;无 space_id 保留(旧消息兼容)
  if (msgSpaceId && msgSpaceId !== spaceId) return false;
  return true;
}

/**
 * 判断单条 Message 是否归属当前 Space(对齐旧 `shouldSkipMessageForSpace`):
 *
 *   - 群聊 → 走 `isChannelOfSpace`
 *   - Person 私聊:看 `content.contentObj.space_id`
 *     - 有 space_id 不匹配 → 过滤
 *     - 无 space_id:SYSTEM_BOTS 过滤,普通私聊保留(旧消息兼容)
 *
 * 用于消息推送 listener 在写 cache / 触发通知前的最终守门。
 */
export function isMessageOfSpace(message: Message, spaceId: string | null): boolean {
  if (!spaceId) return true;
  const channel = message.channel;
  if (!channel) return true;

  if (channel.channelType !== ChannelTypePerson) {
    return isChannelOfSpace(channel, spaceId);
  }

  const msgSpaceId = getMessageSpaceId(message);
  if (msgSpaceId && msgSpaceId !== spaceId) return false;
  if (!msgSpaceId && SYSTEM_BOTS.has(channel.channelID)) return false;
  return true;
}

/** message.content.contentObj.space_id 兜底取值。 */
function getMessageSpaceId(message: Message | undefined): string | undefined {
  if (!message) return undefined;
  const content = message.content as { contentObj?: { space_id?: string } } | undefined;
  return content?.contentObj?.space_id;
}
