import { type Conversation } from "wukongimjssdk";

export function isConversationTop(
  conversation: Pick<Conversation, "channelInfo" | "extra">,
): boolean {
  const channelInfoTop = conversation.channelInfo?.top;
  if (typeof channelInfoTop === "boolean") return channelInfoTop;
  return conversation.extra?.top === 1;
}
