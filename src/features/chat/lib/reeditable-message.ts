import { MessageContentType, type Message, type MessageText } from "wukongimjssdk";
import { RichTextBlockType, type RichTextContent } from "@/features/base/im/richtext-content";
import { MessageContentTypeConst } from "@/features/base/im/content-types";

export function getReeditableMessageText(message: Message): string {
  if (message.contentType === MessageContentType.text) {
    return (message.content as MessageText).text ?? "";
  }

  if (message.contentType !== MessageContentTypeConst.richText) {
    return "";
  }

  const content = message.content as RichTextContent;
  const blocks = content.content ?? [];
  if (blocks.some((block) => block.type !== RichTextBlockType.text)) {
    return "";
  }
  return blocks.map((block) => block.text ?? "").join("");
}

export function canReeditRevokedMessage(message: Message, myUid: string | null): boolean {
  if (!myUid) return false;
  if (!message.remoteExtra?.revoke) return false;
  const revoker = message.remoteExtra.revoker || message.fromUID;
  if (revoker !== myUid || message.fromUID !== myUid) return false;
  return getReeditableMessageText(message).trim() !== "";
}
