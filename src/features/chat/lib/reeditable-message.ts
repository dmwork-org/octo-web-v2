import type { JSONContent } from "@tiptap/react";
import {
  Channel,
  MessageContentType,
  type Message,
  type MessageImage,
  type MessageText,
} from "wukongimjssdk";
import { RichTextBlockType, type RichTextContent } from "@/features/base/im/richtext-content";
import { MessageContentTypeConst } from "@/features/base/im/content-types";
import type { FileContent } from "@/features/base/im/file-content";
import {
  isLikelyRealUid,
  readMessageMention,
  type MentionWithFlags,
} from "@/features/chat/lib/read-message-mention";
import {
  collectMentionCandidateNames,
  lookupMentionUidByDisplayName,
} from "@/features/chat/lib/mention-text-resolver";
import {
  MENTION_LABEL_AIS,
  MENTION_LABEL_HUMANS,
  MENTION_UID_AIS,
  MENTION_UID_HUMANS,
  MENTION_UID_LEGACY_ALL,
} from "@/features/base/lib/mention-three-state";
import type { ReeditBlock } from "@/features/chat/stores/chat-reedit-request";

interface MentionRange {
  start: number;
  end: number;
  uid: string;
  label: string;
}

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
  return getReeditableMessageBlocks(message).length > 0;
}

export function getReeditableMessageBlocks(message: Message): ReeditBlock[] {
  if (message.contentType === MessageContentType.image) {
    const image = message.content as MessageImage;
    if (!image.url) return [];
    return [
      {
        type: "image",
        url: image.url,
        width: image.width,
        height: image.height,
        name: "image.png",
      },
    ];
  }

  if (message.contentType === MessageContentTypeConst.file) {
    const file = message.content as FileContent;
    const url = file.url || file.remoteUrl || "";
    const name = file.name || "file";
    if (!url) return [];
    return [
      {
        type: "file",
        url,
        name,
        size: file.size,
        mime: file.ext ? `application/${file.ext}` : undefined,
      },
    ];
  }

  if (message.contentType === MessageContentTypeConst.richText) {
    return getReeditableRichTextBlocks(message);
  }

  const text = getReeditableMessageText(message);
  if (text.trim() === "") return [];
  return [{ type: "content", content: getReeditableInlineContent(message, text) }];
}

function getReeditableRichTextBlocks(message: Message): ReeditBlock[] {
  const content = message.content as RichTextContent;
  const blocks: ReeditBlock[] = [];
  for (const block of content.content ?? []) {
    if (block.type === RichTextBlockType.image && block.url) {
      blocks.push({
        type: "image",
        url: block.url,
        width: block.width,
        height: block.height,
        size: block.size,
        name: block.name,
      });
      continue;
    }
    if (block.type === RichTextBlockType.file) {
      const label = block.name ? `[文件] ${block.name}` : "[文件]";
      blocks.push({ type: "content", content: textToInlineContent(label) });
      continue;
    }
    const text = block.text ?? "";
    if (text.trim() !== "") {
      blocks.push({ type: "content", content: getReeditableInlineContent(message, text) });
    }
  }
  return blocks;
}

function getReeditableInlineContent(message: Message, text: string): JSONContent[] {
  const mention = readMessageMention(message.content);
  if (!mention) return textToInlineContent(text);

  const ranges = collectMentionRanges(text, mention, message.channel);
  if (ranges.length === 0) return textToInlineContent(text);

  const content: JSONContent[] = [];
  let cursor = 0;
  for (const range of ranges.sort((a, b) => a.start - b.start)) {
    if (range.start < cursor) continue;
    appendTextContent(content, text.slice(cursor, range.start));
    content.push({ type: "mention", attrs: { id: range.uid, label: range.label } });
    cursor = range.end;
  }
  appendTextContent(content, text.slice(cursor));
  return content.length > 0 ? content : textToInlineContent(text);
}

function collectMentionRanges(
  text: string,
  mention: MentionWithFlags,
  channel: Channel,
): MentionRange[] {
  const ranges: MentionRange[] = [];
  const addRange = (range: MentionRange) => {
    if (range.start < 0 || range.end <= range.start) return;
    if (text.slice(range.start, range.end).includes("\n")) return;
    const overlaps = ranges.some((r) => range.start < r.end && range.end > r.start);
    if (!overlaps) ranges.push(range);
  };

  const addKeyword = (needle: string, uid: string, label: string) => {
    const index = findAvailableIndex(text, needle, ranges);
    if (index >= 0) addRange({ start: index, end: index + needle.length, uid, label });
  };

  if (mention.all) {
    addKeyword("@所有人", MENTION_UID_LEGACY_ALL, MENTION_LABEL_HUMANS);
    addKeyword("@all", MENTION_UID_LEGACY_ALL, MENTION_LABEL_HUMANS);
  }
  if (mention.humans) {
    addKeyword("@所有人", MENTION_UID_HUMANS, MENTION_LABEL_HUMANS);
  }
  if (mention.ais) {
    addKeyword("@所有AI", MENTION_UID_AIS, MENTION_LABEL_AIS);
  }

  if (mention.entities?.length) {
    for (const entity of mention.entities) {
      const raw = text.slice(entity.offset, entity.offset + entity.length);
      const label = raw.startsWith("@") ? raw.slice(1) : raw;
      const uid = isLikelyRealUid(entity.uid)
        ? entity.uid
        : lookupMentionUidByDisplayName(channel, label);
      if (!uid || !label) continue;
      addRange({ start: entity.offset, end: entity.offset + entity.length, uid, label });
    }
    return ranges;
  }

  if (mention.ais) return ranges;

  for (const uid of mention.uids ?? []) {
    for (const name of collectMentionCandidateNames(uid, channel)) {
      const needle = `@${name}`;
      const index = findAvailableIndex(text, needle, ranges);
      if (index < 0) continue;
      addRange({ start: index, end: index + needle.length, uid, label: name });
      break;
    }
  }
  return ranges;
}

function textToInlineContent(text: string): JSONContent[] {
  const content: JSONContent[] = [];
  appendTextContent(content, text);
  return content;
}

function appendTextContent(content: JSONContent[], text: string): void {
  const lines = text.split("\n");
  lines.forEach((line, index) => {
    if (index > 0) content.push({ type: "hardBreak" });
    if (line !== "") content.push({ type: "text", text: line });
  });
}

function findAvailableIndex(text: string, needle: string, ranges: MentionRange[]): number {
  let from = 0;
  while (from < text.length) {
    const index = text.indexOf(needle, from);
    if (index < 0) return -1;
    const end = index + needle.length;
    const overlaps = ranges.some((range) => index < range.end && end > range.start);
    if (!overlaps) return index;
    from = end;
  }
  return -1;
}
