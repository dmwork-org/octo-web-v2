import { EMOJI_MAP, getEmojiImageUrl } from "@/features/base/emoji/emoji-data";

interface HighlightRange {
  start: number;
  end: number;
}

export type ChannelSearchSnippetToken =
  | {
      type: "text";
      text: string;
      highlighted: boolean;
    }
  | {
      type: "emoji";
      key: string;
      url: string;
      highlighted: boolean;
    };

export function parseChannelSearchSnippetHighlights(
  text = "",
  keyword = "",
): {
  text: string;
  ranges: HighlightRange[];
} {
  const markPattern = /<mark>([\s\S]*?)<\/mark>/gi;
  const ranges: HighlightRange[] = [];
  const parts: string[] = [];
  let cursor = 0;
  let plainLength = 0;
  let match: RegExpExecArray | null;

  while ((match = markPattern.exec(text))) {
    if (match.index > cursor) {
      const plainText = text.slice(cursor, match.index);
      parts.push(plainText);
      plainLength += plainText.length;
    }

    const markedText = match[1] ?? "";
    const start = plainLength;
    parts.push(markedText);
    plainLength += markedText.length;
    ranges.push({ start, end: start + markedText.length });
    cursor = markPattern.lastIndex;
  }

  if (ranges.length > 0) {
    if (cursor < text.length) parts.push(text.slice(cursor));
    return {
      text: parts.join(""),
      ranges: mergeHighlightRanges(ranges),
    };
  }

  const needle = keyword.trim();
  if (!needle) return { text, ranges };

  const lowerText = text.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  let index = lowerText.indexOf(lowerNeedle);
  while (index !== -1) {
    ranges.push({ start: index, end: index + needle.length });
    index = lowerText.indexOf(lowerNeedle, index + needle.length);
  }

  return {
    text,
    ranges: mergeHighlightRanges(ranges),
  };
}

function mergeHighlightRanges(ranges: HighlightRange[]): HighlightRange[] {
  const sorted = ranges
    .filter((range) => range.end > range.start)
    .sort((a, b) => a.start - b.start);
  const merged: HighlightRange[] = [];

  for (const range of sorted) {
    const prev = merged.at(-1);
    if (prev && range.start <= prev.end) {
      prev.end = Math.max(prev.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }

  return merged;
}

function rangeIntersectsHighlight(start: number, end: number, ranges: HighlightRange[]): boolean {
  return ranges.some((range) => start < range.end && end > range.start);
}

function pushToken(tokens: ChannelSearchSnippetToken[], token: ChannelSearchSnippetToken): void {
  const prev = tokens.at(-1);
  if (token.type === "text" && prev?.type === "text" && prev.highlighted === token.highlighted) {
    prev.text += token.text;
    return;
  }
  tokens.push(token);
}

function pushTextTokens(
  tokens: ChannelSearchSnippetToken[],
  text: string,
  start: number,
  end: number,
  ranges: HighlightRange[],
): void {
  let cursor = start;

  for (const range of ranges) {
    if (range.end <= cursor) continue;
    if (range.start >= end) break;

    const highlightStart = Math.max(range.start, cursor);
    const highlightEnd = Math.min(range.end, end);

    if (highlightStart > cursor) {
      pushToken(tokens, {
        type: "text",
        text: text.slice(cursor, highlightStart),
        highlighted: false,
      });
    }

    if (highlightEnd > highlightStart) {
      pushToken(tokens, {
        type: "text",
        text: text.slice(highlightStart, highlightEnd),
        highlighted: true,
      });
    }
    cursor = highlightEnd;
  }

  if (cursor < end) {
    pushToken(tokens, {
      type: "text",
      text: text.slice(cursor, end),
      highlighted: false,
    });
  }
}

function findNextEmoji(
  text: string,
  from: number,
): { key: string; start: number; end: number } | null {
  let best: { key: string; start: number; end: number } | null = null;
  for (const key of EMOJI_MAP.keys()) {
    const start = text.indexOf(key, from);
    if (start === -1) continue;
    const end = start + key.length;
    if (!best || start < best.start || (start === best.start && key.length > best.key.length)) {
      best = { key, start, end };
    }
  }
  return best;
}

export function buildChannelSearchSnippetTokens(
  text: string,
  ranges: HighlightRange[],
): ChannelSearchSnippetToken[] {
  const tokens: ChannelSearchSnippetToken[] = [];
  if (!text) return tokens;

  let cursor = 0;
  while (cursor < text.length) {
    const nextEmoji = findNextEmoji(text, cursor);
    if (!nextEmoji) break;

    if (nextEmoji.start > cursor) {
      pushTextTokens(tokens, text, cursor, nextEmoji.start, ranges);
    }

    const url = getEmojiImageUrl(nextEmoji.key);
    if (url) {
      pushToken(tokens, {
        type: "emoji",
        key: nextEmoji.key,
        url,
        highlighted: rangeIntersectsHighlight(nextEmoji.start, nextEmoji.end, ranges),
      });
    } else {
      pushTextTokens(tokens, text, nextEmoji.start, nextEmoji.end, ranges);
    }
    cursor = nextEmoji.end;
  }

  if (cursor < text.length) {
    pushTextTokens(tokens, text, cursor, text.length, ranges);
  }

  return tokens;
}

export function tokenizeChannelSearchSnippet(
  text: string | undefined,
  keyword: string,
): ChannelSearchSnippetToken[] {
  const parsed = parseChannelSearchSnippetHighlights(text ?? "", keyword);
  return buildChannelSearchSnippetTokens(parsed.text, parsed.ranges);
}
