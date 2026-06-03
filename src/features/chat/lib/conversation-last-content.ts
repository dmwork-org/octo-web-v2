import WKSDK, {
  Channel,
  type Conversation,
  ChannelTypePerson,
  type Message,
  ReminderType,
} from "wukongimjssdk";
import { parseThreadChannelId } from "@/features/base/im/parse-thread-channel-id";
import { tryFetchChannelInfo } from "@/features/chat/lib/live-channel-title";

/**
 * conversation-list 行内"最后一条消息"展示文本(1:1 对齐旧 dmworkbase
 * Components/ConversationList/index.tsx::lastContent):
 *
 * 优先级:
 *   1. lastMessage 为空 → ""
 *   2. AI 协作 fold session 预览 → 由 typing-digest 在外层短路(本函数返回原 digest,
 *      foldSessionPreview 老仓自定义 Map,新仓 AI 协作模块未搬,**先跳**,后续补 TODO)
 *   3. 撤回(remoteExtra.revoke)→ "{name}撤回了一条消息"(name = me ? "你" : channelInfo.title || uid)
 *   4. 自毁(flame)— 新仓 SDK 无 flame 字段,**跳过**
 *   5. Person → lastMessage.content.conversationDigest
 *   6. Group/Topic → "{发送人}: " + digest(发送人 = me ? "" : Person channelInfo.title)
 *
 * 不引 hook(供 row / cell 内同步调用):用 WKApp.shared 等价路径 — 通过 authStore 读
 * myUid 的部分由调用方传入,避免每行重渲都触发 useStore 订阅。
 */
export function lastMessageDigest(conv: Conversation, myUid: string): string {
  const last = conv.lastMessage;
  if (!last) return "";

  if (last.remoteExtra?.revoke) {
    const revoker = last.remoteExtra.revoker || last.fromUID;
    const name = revoker === myUid ? "你" : personDisplayName(revoker);
    return `${name}撤回了一条消息`;
  }

  const digest =
    (last.content as { conversationDigest?: string } | undefined)?.conversationDigest ?? "";

  // Person:digest 直返
  if (conv.channel.channelType === ChannelTypePerson) return digest;

  // Group / Topic:加发送人前缀(发送人是自己时不加 — 对齐老仓 from 默认 "" 的语义:
  // 老仓 lastContent 是无差加 from,但发送人 channelInfo 取不到时显 "")
  const fromName = getFromName(last);
  if (!fromName) return digest;
  return `${fromName}: ${digest}`;
}

/** 抽出来给 typing-digest fallback 用 — 是否 lastMessage 已撤回(撤回时不显 typing,直接显 tip)。 */
export function isLastMessageRevoked(conv: Conversation): boolean {
  return !!conv.lastMessage?.remoteExtra?.revoke;
}

/**
 * isMentionMe — 1:1 对齐旧 Service/Model.tsx ConversationWrap.isMentionMe getter:
 *   1. 权威:server-side reminders(reminderType === MentionMe && !done)
 *   2. 实时兜底:lastMessage.content.mention.uids 包含 myUid
 *
 * SDK Conversation 自带 isMentionMe getter/setter,但 setter 是显式赋值(老仓 vm 算完写回),
 * 新仓没那一层 vm — 这里改成"现算"模式,行内直接调,免去 listener 同步开销。
 */
export function isMentionMe(conv: Conversation, myUid: string): boolean {
  if (!myUid) return false;
  const reminders = conv.reminders ?? [];
  if (reminders.some((r) => r.reminderType === ReminderType.ReminderTypeMentionMe && !r.done)) {
    return true;
  }
  const mention = (conv.lastMessage?.content as { mention?: { uids?: string[] } } | undefined)
    ?.mention;
  if (mention?.uids && mention.uids.includes(myUid)) return true;
  return false;
}

/**
 * effectiveMute — 1:1 对齐旧 ConversationList 非 compact 行 (534-542):
 * - 子区无显式 mute 设置时继承父群 mute
 * - 群组直接读自身 mute
 *
 * 老仓 thread 显式 mute 来源是 channelInfo.orgData.thread.mute(0/1/null);新仓 thread
 * 字段是否在 orgData 待 backend 接通,暂用 `?? null` 兜底 — null = 未显式设置 → 继承父群。
 */
const CHANNEL_TYPE_THREAD = 5;

export function effectiveMute(conv: Conversation): boolean {
  const channel = conv.channel;
  const info = conv.channelInfo;
  if (channel.channelType !== CHANNEL_TYPE_THREAD) {
    return !!info?.mute;
  }
  // 子区:自身显式 mute 优先
  const threadRawMute = (info?.orgData as { thread?: { mute?: number | null } } | undefined)?.thread
    ?.mute;
  if (threadRawMute != null) return threadRawMute === 1;
  // 未显式 → 继承父群
  const parentGroupNo =
    (info?.orgData as { parentGroupNo?: string } | undefined)?.parentGroupNo ||
    parseThreadChannelId(channel.channelID)?.groupNo;
  if (!parentGroupNo) return false;
  const parentInfo = WKSDK.shared().channelManager.getChannelInfo(new Channel(parentGroupNo, 2));
  return !!parentInfo?.mute;
}

// ─── internal helpers ────────────────────────────────────

function personDisplayName(uid: string): string {
  if (!uid) return "";
  const info = WKSDK.shared().channelManager.getChannelInfo(new Channel(uid, ChannelTypePerson));
  return info?.title || uid;
}

function getFromName(last: Message): string {
  if (!last.fromUID) return "";
  const personChannel = new Channel(last.fromUID, ChannelTypePerson);
  const info = WKSDK.shared().channelManager.getChannelInfo(personChannel);
  if (!info) {
    // 异步预拉(模块级 attempted set dedup,防 listener writeSnapshot 重渲风暴)
    tryFetchChannelInfo(personChannel);
    return "";
  }
  return info.title || "";
}
