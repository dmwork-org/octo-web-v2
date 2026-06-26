import type { Editor } from "@tiptap/core";
import {
  RichTextFilePlaceholder,
  RichTextImagePlaceholder,
} from "@/features/base/im/richtext-content";
import {
  isBroadcastSentinelUid,
} from "@/features/base/lib/mention-three-state";
import {
  mentionDisplayLabel,
  mentionNameAliases,
  type MentionMemberSource,
} from "@/features/chat/lib/mention-resolve";
import type {
  OctoRichTextClipboardBlock,
  OctoRichTextClipboardMention,
  OctoRichTextClipboardPayload,
} from "@/features/chat/lib/rich-text-clipboard";

export type AddAttachment = (
  files: File[],
  source: "paste" | "upload",
  editor: Editor | null,
) => boolean | void | Promise<boolean | void>;

export const MAX_PASTE_IMAGE_BYTES = 20 * 1024 * 1024;

function isSafeUrl(url: string): boolean {
  try {
    const u = new URL(url, window.location.href);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function appendPlainText(nodes: unknown[], text: string) {
  if (!text) return;
  const lines = text.split("\n");
  lines.forEach((line, index) => {
    if (line) nodes.push({ type: "text", text: line });
    if (index < lines.length - 1) nodes.push({ type: "hardBreak" });
  });
}

function mentionAllowKey(uid: string, label: string): string {
  return `${uid}\u0000${label}`;
}

function buildAllowedMentionKeys(
  members?: readonly MentionMemberSource[],
): ReadonlySet<string> {
  const allowed = new Set<string>();
  for (const member of members ?? []) {
    if (!member.uid || member.isDeleted) continue;
    const labels = [mentionDisplayLabel(member), ...mentionNameAliases(member), member.uid];
    for (const label of labels) {
      if (label) allowed.add(mentionAllowKey(member.uid, label));
    }
  }
  return allowed;
}

export function buildInlineContentForRichTextPaste(
  text: string,
  mentions?: OctoRichTextClipboardMention[],
  members?: readonly MentionMemberSource[],
): unknown[] {
  const nodes: unknown[] = [];
  const allowedKeys = buildAllowedMentionKeys(members);
  const sortedMentions = (mentions || [])
    .filter((m) => m.offset >= 0 && m.length > 0 && m.offset + m.length <= text.length)
    .sort((a, b) => a.offset - b.offset);

  let cursor = 0;
  for (const mention of sortedMentions) {
    if (mention.offset < cursor) continue;
    appendPlainText(nodes, text.slice(cursor, mention.offset));
    const labelText = text.slice(mention.offset, mention.offset + mention.length);
    const label = labelText.startsWith("@") ? labelText.slice(1) : "";
    if (
      label &&
      !isBroadcastSentinelUid(mention.uid) &&
      allowedKeys.has(mentionAllowKey(mention.uid, label))
    ) {
      nodes.push({
        type: "mention",
        attrs: {
          id: mention.uid,
          label,
        },
      });
    } else {
      appendPlainText(nodes, labelText);
    }
    cursor = mention.offset + mention.length;
  }

  appendPlainText(nodes, text.slice(cursor));
  return nodes;
}

function insertInlineContent(editor: Editor, content: unknown[]) {
  if (content.length === 0) return;
  editor.chain().focus().insertContent(content).run();
}

function safeImageFileName(name?: string, mime?: string): string {
  const fallbackExt = mime?.split("/").pop() || "png";
  const fallback = `image.${fallbackExt}`;
  const raw = (name || fallback).replace(/[\\/:*?"<>|]+/g, "_").slice(0, 120);
  return raw || fallback;
}

function parseContentLength(value: string | null): number | null {
  if (!value) return null;
  const size = Number(value);
  return Number.isFinite(size) && size >= 0 ? size : null;
}

function normalizeMime(value: string | null | undefined): string {
  return (value || "").split(";")[0].trim().toLowerCase();
}

async function responseToCappedImageBlob(response: Response): Promise<Blob | null> {
  const contentLength = parseContentLength(response.headers.get("Content-Length"));
  if (contentLength !== null && contentLength > MAX_PASTE_IMAGE_BYTES) return null;
  const contentType = normalizeMime(response.headers.get("Content-Type"));

  if (response.body?.getReader) {
    const reader = response.body.getReader();
    const chunks: ArrayBuffer[] = [];
    let received = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        received += value.byteLength;
        if (received > MAX_PASTE_IMAGE_BYTES) {
          await reader.cancel();
          return null;
        }
        chunks.push(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
      }
    } catch {
      return null;
    }
    return new Blob(chunks, { type: contentType });
  }

  const blob = await response.blob();
  if (blob.size > MAX_PASTE_IMAGE_BYTES) return null;
  return blob;
}

export async function imageBlockToPasteFile(
  block: Extract<OctoRichTextClipboardBlock, { type: "image" }>,
): Promise<File | null> {
  if (!isSafeUrl(block.url)) return null;

  try {
    const response = await fetch(block.url, {
      mode: "cors",
      credentials: "omit",
    });
    if (!response.ok) return null;
    const blob = await responseToCappedImageBlob(response);
    if (!blob) return null;
    const type = normalizeMime(blob.type || response.headers.get("Content-Type"));
    if (!type.startsWith("image/")) return null;
    return new File([blob], safeImageFileName(block.name, type), {
      type,
      lastModified: Date.now(),
    });
  } catch {
    return null;
  }
}

export async function restoreOctoRichTextClipboardToEditor(
  payload: OctoRichTextClipboardPayload,
  editor: Editor,
  addAttachment: AddAttachment,
  members?: readonly MentionMemberSource[],
): Promise<void> {
  for (const block of payload.blocks) {
    if (block.type === "text") {
      insertInlineContent(
        editor,
        buildInlineContentForRichTextPaste(block.text, block.mentions, members),
      );
      continue;
    }

    if (block.type === "image") {
      const file = await imageBlockToPasteFile(block);
      if (file) {
        const accepted = await addAttachment([file], "paste", editor);
        if (accepted !== false) continue;
      }
      insertInlineContent(editor, [{ type: "text", text: RichTextImagePlaceholder }]);
      continue;
    }

    if (block.type === "file") {
      const label = block.name
        ? `${RichTextFilePlaceholder} ${block.name}`
        : RichTextFilePlaceholder;
      insertInlineContent(editor, [{ type: "text", text: label }]);
    }
  }
}
