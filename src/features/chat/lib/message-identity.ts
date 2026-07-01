import { MessageContentTypeConst } from "@/features/base/im/content-types";

export interface MessageIdentityLike {
  clientMsgNo?: string | null;
  messageID?: string | number | null;
  messageSeq?: number | null;
  clientSeq?: number | null;
  contentType?: number | null;
  timestamp?: number | null;
  fromUID?: string | null;
}

const NON_MESSAGE_MARKER_TYPES = new Set<number>([
  MessageContentTypeConst.time,
  MessageContentTypeConst.historySplit,
  MessageContentTypeConst.typing,
]);

function cleanString(value: string | number | null | undefined): string {
  if (value == null) return "";
  return String(value).trim();
}

function positiveNumber(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

export function isNonMessageMarker(message: MessageIdentityLike): boolean {
  return (
    typeof message.contentType === "number" && NON_MESSAGE_MARKER_TYPES.has(message.contentType)
  );
}

export function isCacheableChatMessage(message: MessageIdentityLike): boolean {
  return !isNonMessageMarker(message);
}

export function isSameMessageIdentity(a: MessageIdentityLike, b: MessageIdentityLike): boolean {
  const aClientMsgNo = cleanString(a.clientMsgNo);
  const bClientMsgNo = cleanString(b.clientMsgNo);
  if (aClientMsgNo && bClientMsgNo && aClientMsgNo === bClientMsgNo) return true;

  const aMessageId = cleanString(a.messageID);
  const bMessageId = cleanString(b.messageID);
  if (aMessageId && bMessageId && aMessageId === bMessageId) return true;

  const aSeq = positiveNumber(a.messageSeq);
  const bSeq = positiveNumber(b.messageSeq);
  return aSeq > 0 && aSeq === bSeq;
}

export function messageRenderKey(message: MessageIdentityLike, index?: number): string {
  const clientMsgNo = cleanString(message.clientMsgNo);
  if (clientMsgNo) return `client:${clientMsgNo}`;

  const messageId = cleanString(message.messageID);
  if (messageId) return `message:${messageId}`;

  const messageSeq = positiveNumber(message.messageSeq);
  if (messageSeq > 0) return `seq:${messageSeq}`;

  const contentType = typeof message.contentType === "number" ? message.contentType : "unknown";
  const timestamp =
    typeof message.timestamp === "number" && Number.isFinite(message.timestamp)
      ? message.timestamp
      : 0;
  const clientSeq = positiveNumber(message.clientSeq);
  const fromUID = cleanString(message.fromUID) || "unknown";
  const fallbackIndex = typeof index === "number" ? index : "x";
  return `fallback:${contentType}:${fromUID}:${timestamp}:${clientSeq}:${fallbackIndex}`;
}
