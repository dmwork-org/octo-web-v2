import WKSDK, { Channel, ChannelTypePerson, type Message } from "wukongimjssdk";
import { chatReplyActions } from "@/features/chat/stores/chat-reply";
import { chatMentionRequestActions } from "@/features/chat/stores/chat-mention-request";

/**
 * 引用消息 + 群聊自动 @(对齐老仓 Conversation/index.tsx:1028-1040 reply +
 * 474-485 addReplyMention):
 *
 *   - 群/thread + 非自己消息 → 自动 @ 源消息发送者
 *   - 私聊 / 引用自己消息 → 仅 set reply,不 @(对齐上游 ff46fa58:
 *     addReplyMention 在 ChannelTypePerson 时直接返回)
 *
 * caller(右键菜单 / file-preview reply 按钮等)统一走这个 helper,避免不对称。
 */
export function replyToMessage(channel: Channel, message: Message, myUid: string | null): void {
  chatReplyActions.set(channel, message);
  if (!myUid) return;
  if (message.fromUID === myUid) return;
  if (channel.channelType === ChannelTypePerson) return;
  const label = personChannelInfoTitle(message.fromUID);
  chatMentionRequestActions.request(channel, { uid: message.fromUID, label });
}

/** uid → Person channelInfo.title fallback ""(无缓存时不抓,composer mention 仍可用 uid 兜底)。 */
function personChannelInfoTitle(uid: string): string {
  if (!uid) return "";
  const info = WKSDK.shared().channelManager.getChannelInfo(new Channel(uid, ChannelTypePerson));
  return info?.title ?? "";
}
