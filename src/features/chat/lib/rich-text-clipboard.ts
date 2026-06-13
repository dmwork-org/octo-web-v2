import WKSDK, { Channel, ChannelTypeGroup, ChannelTypePerson, type Mention } from "wukongimjssdk";
import {
  buildRichTextPlain,
  RichTextBlockType,
  type RichTextBlock,
  type RichTextContent,
  RichTextFilePlaceholder,
  RichTextImagePlaceholder,
} from "@/features/base/im/richtext-content";
import { parseThreadChannelId } from "@/features/base/im/parse-thread-channel-id";
import {
  MENTION_LABEL_AIS,
  MENTION_LABEL_HUMANS,
  MENTION_UID_AIS,
  MENTION_UID_HUMANS,
} from "@/features/base/lib/mention-three-state";
import {
  type MentionWithFlags,
  readMessageMention,
} from "@/features/chat/lib/read-message-mention";

export const OCTO_RICHTEXT_CLIPBOARD_ATTR = "data-octo-richtext";

export interface OctoRichTextClipboardMention {
  uid: string;
  offset: number;
  length: number;
}

export type OctoRichTextClipboardBlock =
  | { type: "text"; text: string; mentions?: OctoRichTextClipboardMention[] }
  | {
      type: "image";
      url: string;
      width?: number;
      height?: number;
      size?: number;
      name?: string;
      mime?: string;
    }
  | { type: "file"; name?: string };

export interface OctoRichTextClipboardPayload {
  version: 1;
  blocks: OctoRichTextClipboardBlock[];
  plain?: string;
}

const CHANNEL_TYPE_THREAD = 5;
const MAX_BLOCKS = 100;
const MAX_TEXT_LENGTH = 20_000;
const MAX_IMAGES = 20;
const MAX_IMAGE_URL_LENGTH = 4096;
const MAX_ENCODED_PAYLOAD_LENGTH = 256_000;

function isSafeUrl(url: string): boolean {
  try {
    const u = new URL(url, window.location.href);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function collectCandidateNames(uid: string, channel: Channel): string[] {
  const names: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === "string" && v.length > 0 && !names.includes(v)) names.push(v);
  };

  let groupChannel: Channel | null = null;
  if (channel.channelType === ChannelTypeGroup) {
    groupChannel = channel;
  } else if (channel.channelType === CHANNEL_TYPE_THREAD) {
    const parsed = parseThreadChannelId(channel.channelID);
    if (parsed) groupChannel = new Channel(parsed.groupNo, ChannelTypeGroup);
  }

  if (groupChannel) {
    const sub = WKSDK.shared()
      .channelManager.getSubscribes(groupChannel)
      ?.find((s) => s.uid === uid);
    push(sub?.remark);
    push(sub?.name);
    const org = sub?.orgData as { real_name?: string; displayName?: string } | undefined;
    push(org?.real_name);
    push(org?.displayName);
  }

  const info = WKSDK.shared().channelManager.getChannelInfo(new Channel(uid, ChannelTypePerson));
  push(info?.title);
  const org = info?.orgData as
    | { remark?: string; real_name?: string; displayName?: string }
    | undefined;
  push(org?.remark);
  push(org?.real_name);
  push(org?.displayName);
  return names;
}

function getBlockPlainLength(block: RichTextBlock): number {
  if (block.type === RichTextBlockType.image) return RichTextImagePlaceholder.length;
  if (block.type === RichTextBlockType.file) {
    return block.name
      ? `${RichTextFilePlaceholder} ${block.name}`.length
      : RichTextFilePlaceholder.length;
  }
  return (block.text || "").length;
}

function pushOccurrences(
  out: OctoRichTextClipboardMention[],
  text: string,
  needle: string,
  uid: string,
  claimed: Array<{ start: number; end: number }>,
) {
  let from = 0;
  while (from < text.length) {
    const start = text.indexOf(needle, from);
    if (start === -1) break;
    const end = start + needle.length;
    const overlaps = claimed.some((r) => start < r.end && end > r.start);
    if (!overlaps) {
      out.push({ uid, offset: start, length: needle.length });
      claimed.push({ start, end });
    }
    from = start + needle.length;
  }
}

function mentionRangesForText(
  text: string,
  plainOffset: number,
  mention: Mention | undefined,
  channel: Channel | undefined,
): OctoRichTextClipboardMention[] {
  if (!mention || !text) return [];
  const flags = mention as MentionWithFlags;
  const out: OctoRichTextClipboardMention[] = [];
  const claimed: Array<{ start: number; end: number }> = [];

  if (flags.entities?.length) {
    const end = plainOffset + text.length;
    for (const entity of flags.entities) {
      if (entity.offset < plainOffset || entity.offset + entity.length > end) continue;
      const localOffset = entity.offset - plainOffset;
      out.push({ uid: entity.uid, offset: localOffset, length: entity.length });
      claimed.push({ start: localOffset, end: localOffset + entity.length });
    }
    return out;
  }

  if (mention.all || flags.humans) {
    pushOccurrences(out, text, `@${MENTION_LABEL_HUMANS}`, MENTION_UID_HUMANS, claimed);
    pushOccurrences(out, text, "@all", MENTION_UID_HUMANS, claimed);
  }
  if (flags.ais) {
    pushOccurrences(out, text, `@${MENTION_LABEL_AIS}`, MENTION_UID_AIS, claimed);
    return out;
  }

  if (!channel) return out;
  for (const uid of mention.uids ?? []) {
    const names = collectCandidateNames(uid, channel);
    for (const name of names.slice().sort((a, b) => a.length - b.length)) {
      const needle = `@${name}`;
      const start = text.indexOf(needle);
      if (start === -1) continue;
      const end = start + needle.length;
      if (claimed.some((r) => start < r.end && end > r.start)) continue;
      out.push({ uid, offset: start, length: needle.length });
      claimed.push({ start, end });
      break;
    }
  }
  return out;
}

export function buildOctoRichTextClipboardPayload(
  content: RichTextContent,
  channel?: Channel,
): OctoRichTextClipboardPayload {
  const mention = readMessageMention(content);
  const blocks: OctoRichTextClipboardBlock[] = [];
  let plainOffset = 0;

  for (const block of content.content || []) {
    if (blocks.length >= MAX_BLOCKS) break;

    if (block.type === RichTextBlockType.image && block.url) {
      blocks.push({
        type: "image",
        url: block.url,
        width: block.width,
        height: block.height,
        size: block.size,
        name: block.name,
      });
      plainOffset += getBlockPlainLength(block);
      continue;
    }

    if (block.type === RichTextBlockType.file) {
      blocks.push({ type: "file", name: block.name });
      plainOffset += getBlockPlainLength(block);
      continue;
    }

    const text = block.text || "";
    if (block.type === RichTextBlockType.text || text) {
      const mentions = mentionRangesForText(text, plainOffset, mention, channel);
      blocks.push({ type: "text", text, mentions: mentions.length ? mentions : undefined });
    }
    plainOffset += getBlockPlainLength(block);
  }

  return {
    version: 1,
    blocks,
    plain: content.plain || buildRichTextPlain(content.content || []) || undefined,
  };
}

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function encodeOctoRichTextClipboardPayload(payload: OctoRichTextClipboardPayload): string {
  return encodeBase64Url(JSON.stringify(payload));
}

function normalizeMention(raw: unknown, textLength: number): OctoRichTextClipboardMention | null {
  const mention = raw as OctoRichTextClipboardMention | undefined;
  if (
    !mention ||
    typeof mention.uid !== "string" ||
    !Number.isFinite(mention.offset) ||
    !Number.isFinite(mention.length)
  ) {
    return null;
  }
  const offset = Math.floor(mention.offset);
  const length = Math.floor(mention.length);
  if (offset < 0 || length <= 0 || offset + length > textLength) return null;
  return { uid: mention.uid, offset, length };
}

function normalizePayload(raw: unknown): OctoRichTextClipboardPayload | null {
  const payload = raw as { version?: unknown; blocks?: unknown[]; plain?: unknown } | null;
  if (!payload || payload.version !== 1 || !Array.isArray(payload.blocks)) return null;

  const blocks: OctoRichTextClipboardBlock[] = [];
  let textLength = 0;
  let imageCount = 0;

  for (const rawBlock of payload.blocks.slice(0, MAX_BLOCKS)) {
    const block = rawBlock as Record<string, unknown> | null;
    if (!block || typeof block.type !== "string") continue;

    if (block.type === "text") {
      const text = typeof block.text === "string" ? block.text : "";
      if (!text) continue;
      const remaining = MAX_TEXT_LENGTH - textLength;
      if (remaining <= 0) break;
      const safeText = text.slice(0, remaining);
      textLength += safeText.length;
      const mentions = Array.isArray(block.mentions)
        ? block.mentions
            .map((m) => normalizeMention(m, safeText.length))
            .filter((m): m is OctoRichTextClipboardMention => !!m)
        : [];
      blocks.push({
        type: "text",
        text: safeText,
        mentions: mentions.length ? mentions : undefined,
      });
      continue;
    }

    if (block.type === "image") {
      if (imageCount >= MAX_IMAGES || typeof block.url !== "string") continue;
      const url = block.url.slice(0, MAX_IMAGE_URL_LENGTH);
      if (!url) continue;
      imageCount += 1;
      blocks.push({
        type: "image",
        url,
        width: Number.isFinite(block.width) ? (block.width as number) : undefined,
        height: Number.isFinite(block.height) ? (block.height as number) : undefined,
        size: Number.isFinite(block.size) ? (block.size as number) : undefined,
        name: typeof block.name === "string" ? block.name : undefined,
        mime: typeof block.mime === "string" ? block.mime : undefined,
      });
      continue;
    }

    if (block.type === "file") {
      blocks.push({ type: "file", name: typeof block.name === "string" ? block.name : undefined });
    }
  }

  return {
    version: 1,
    blocks,
    plain: typeof payload.plain === "string" ? payload.plain : undefined,
  };
}

export function decodeOctoRichTextClipboardPayload(
  encoded: string,
): OctoRichTextClipboardPayload | null {
  if (!encoded || encoded.length > MAX_ENCODED_PAYLOAD_LENGTH) return null;
  try {
    return normalizePayload(JSON.parse(decodeBase64Url(encoded)));
  } catch {
    return null;
  }
}

const octoRichTextAttrPattern =
  /(?:^|[\s<])data-octo-richtext\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i;
const base64UrlPattern = /^[A-Za-z0-9_-]+$/;

export function extractOctoRichTextClipboardPayloadFromHtml(
  html: string,
): OctoRichTextClipboardPayload | null {
  const match = html.match(octoRichTextAttrPattern);
  const encoded = match?.[1] || match?.[2] || match?.[3] || "";
  if (!encoded || !base64UrlPattern.test(encoded)) return null;
  return decodeOctoRichTextClipboardPayload(encoded);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function blockToHtml(block: RichTextBlock): string {
  if (block.type === RichTextBlockType.image) {
    if (!block.url || !isSafeUrl(block.url)) return escapeHtml(RichTextImagePlaceholder);
    const alt = escapeHtml(block.name || RichTextImagePlaceholder);
    return `<img src="${escapeHtml(block.url)}" alt="${alt}" />`;
  }
  if (block.type === RichTextBlockType.file) {
    const label = block.name ? `${RichTextFilePlaceholder} ${block.name}` : RichTextFilePlaceholder;
    return escapeHtml(label);
  }
  return escapeHtml(block.text || "").replace(/\n/g, "<br>");
}

export function buildRichTextClipboardHtml(content: RichTextContent, channel?: Channel): string {
  const payload = encodeOctoRichTextClipboardPayload(
    buildOctoRichTextClipboardPayload(content, channel),
  );
  const body = (content.content || []).map(blockToHtml).join("");
  return `<div ${OCTO_RICHTEXT_CLIPBOARD_ATTR}="${payload}">${body}</div>`;
}

function copyHtmlToClipboard(html: string, plain: string): boolean {
  if (typeof document === "undefined" || typeof document.execCommand !== "function") {
    return false;
  }

  let container: HTMLDivElement | null = null;
  const selection = typeof window !== "undefined" ? window.getSelection?.() : null;
  const previousRanges: Range[] = [];
  if (selection) {
    for (let i = 0; i < selection.rangeCount; i += 1) {
      previousRanges.push(selection.getRangeAt(i).cloneRange());
    }
  }

  const handleCopy = (event: ClipboardEvent) => {
    if (!event.clipboardData) return;
    event.preventDefault();
    event.clipboardData.setData("text/html", html);
    event.clipboardData.setData("text/plain", plain);
  };

  try {
    container = document.createElement("div");
    container.setAttribute("aria-hidden", "true");
    container.style.position = "fixed";
    container.style.top = "0";
    container.style.left = "0";
    container.style.opacity = "0";
    container.style.pointerEvents = "none";
    container.contentEditable = "true";
    container.innerHTML = html;
    document.body.appendChild(container);

    const range = document.createRange();
    range.selectNodeContents(container);
    selection?.removeAllRanges();
    selection?.addRange(range);

    document.addEventListener("copy", handleCopy);
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.removeEventListener("copy", handleCopy);
    selection?.removeAllRanges();
    previousRanges.forEach((range) => selection?.addRange(range));
    container?.parentNode?.removeChild(container);
  }
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through
    }
  }

  let textarea: HTMLTextAreaElement | null = null;
  try {
    textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.readOnly = true;
    textarea.style.position = "fixed";
    textarea.style.top = "0";
    textarea.style.left = "0";
    textarea.style.opacity = "0";
    textarea.style.fontSize = "16px";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textarea?.parentNode?.removeChild(textarea);
  }
}

export async function copyRichTextToClipboard(
  content: RichTextContent,
  channel?: Channel,
): Promise<boolean> {
  const plain = content.plain || buildRichTextPlain(content.content || []);
  const html = buildRichTextClipboardHtml(content, channel);

  if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([plain], { type: "text/plain" }),
        }),
      ]);
      return true;
    } catch {
      // execCommand can still write rich HTML on browsers that reject ClipboardItem.
    }
  }

  if (copyHtmlToClipboard(html, plain)) return true;
  return copyTextToClipboard(plain);
}
