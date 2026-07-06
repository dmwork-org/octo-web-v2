import { getAllEmojiItems, subscribeEmojiManifest } from "@/features/base/emoji/emoji-data";

export interface EmojiSuggestItem {
  key: string;
  label: string;
  image: string;
}

export const MIN_EMOJI_QUERY_LEN = 2;
const CJK_CHAR = /[一-鿿]/;
const RESERVED_PREFIX_CHARS = new Set(["@", "/", "["]);

let cachedItems: EmojiSuggestItem[] | null = null;

subscribeEmojiManifest(() => {
  cachedItems = null;
});

export function trailingChineseWord(text: string): string {
  let i = text.length;
  while (i > 0 && CJK_CHAR.test(text[i - 1])) i--;
  return text.slice(i);
}

export function getCustomEmojiSuggestItems(): EmojiSuggestItem[] {
  if (cachedItems) return cachedItems;
  cachedItems = getAllEmojiItems()
    .filter((item) => /^\[.+\]$/.test(item.key))
    .map((item) => ({
      key: item.key,
      label: item.key.slice(1, -1),
      image: item.url,
    }));
  return cachedItems;
}

export function buildEmojiSuggestItems(query: string): EmojiSuggestItem[] {
  if (!query || query.length < MIN_EMOJI_QUERY_LEN) return [];
  return getCustomEmojiSuggestItems().filter((item) => item.label.startsWith(query));
}

export function matchEmojiPrefix(
  textBeforeCursor: string,
): { query: string; items: EmojiSuggestItem[] } | null {
  const word = trailingChineseWord(textBeforeCursor);
  if (word.length < MIN_EMOJI_QUERY_LEN) return null;
  const charBefore = textBeforeCursor[textBeforeCursor.length - word.length - 1];
  if (charBefore !== undefined && RESERVED_PREFIX_CHARS.has(charBefore)) return null;
  const items = buildEmojiSuggestItems(word);
  return items.length > 0 ? { query: word, items } : null;
}
