/**
 * Emoji 数据层 — 1:1 复刻旧 dmworkbase Service/EmojiService.ts emojiMap。
 *
 * **结构**:keyword(`[使命必达]` / `😀` / unicode 序列)→ image URL。
 * 自定义表情优先用服务端 manifest(`/v1/common/emojis`),失败时回落本地 PNG。
 *
 * **用法**:
 * - `getEmojiImageUrl(keyword)` — 单点查图,返回空表示非 emoji
 * - `findEmojiKeywords(text)` — 扫文本中**出现过**的 keyword,用于生成 Markdown token
 * - `getSingleCustomEmoji(text)` — 全文本 trim 后是否仅含 1 个 custom_ keyword,
 *   用于触发 large emoji(120×120)对齐旧 `isLargeCustomEmoji`
 *
 * **不**自动按 emoji 字典爆破任意字符:仅 keyword 命中才替换,避免误识别。
 */
import { getEmojiManifest, type EmojiManifestItem } from "@/features/base/api/endpoints/emoji.api";

export interface EmojiPickerItem {
  key: string;
  name: string;
  url: string;
}

const EMOJI_MANIFEST_CACHE_KEY = "octo:emoji-manifest:v1";

const BUILTIN_CUSTOM_EMOJIS: Array<{ key: string; name: string; base: string }> = [
  { key: "[使命必达]", name: "使命必达", base: "custom_mission" },
  { key: "[崇尚行动]", name: "崇尚行动", base: "custom_action" },
  { key: "[有品位]", name: "有品位", base: "custom_taste" },
  { key: "[尚方宝剑]", name: "尚方宝剑", base: "custom_shangfang" },
];

const UNICODE_EMOJI_MAP = new Map<string, string>([
  ["😀", "0_0"],
  ["😃", "0_1"],
  ["😄", "0_2"],
  ["😁", "0_3"],
  ["😆", "0_4"],
  ["😅", "0_5"],
  ["😂", "0_6"],
  ["🤣", "0_7"],
  ["🥲", "0_8"],
  ["☺️", "0_9"],
  ["😊", "0_10"],
  ["😇", "0_11"],
  ["🙂", "0_12"],
  ["🙃", "0_13"],
  ["😉", "0_14"],
  ["😌", "0_15"],
  ["😍", "0_16"],
  ["🥰", "0_17"],
  ["😘", "0_18"],
  ["😗", "0_19"],
  ["😙", "0_20"],
  ["😚", "0_21"],
  ["😋", "0_22"],
  ["😛", "0_23"],
  ["😝", "0_24"],
  ["😜", "0_25"],
  ["🤪", "0_26"],
  ["🤨", "0_27"],
  ["🧐", "0_28"],
  ["🤓", "0_29"],
  ["😎", "0_30"],
  ["🥸", "0_31"],
  ["🤩", "0_32"],
  ["🥳", "0_33"],
  ["😏", "0_34"],
  ["😒", "0_35"],
  ["😞", "0_36"],
  ["😔", "0_37"],
  ["😟", "0_38"],
  ["😕", "0_39"],
  ["🙁", "0_40"],
  ["☹️", "0_41"],
  ["😣", "0_42"],
  ["😖", "0_43"],
  ["😫", "0_44"],
  ["😩", "0_45"],
  ["🥺", "0_46"],
  ["😢", "0_47"],
  ["😭", "0_48"],
  ["😤", "0_49"],
  ["😠", "0_50"],
  ["😡", "0_51"],
  ["🤬", "0_52"],
  ["🤯", "0_53"],
  ["😳", "0_54"],
  ["🥵", "0_55"],
  ["🥶", "0_56"],
  ["😱", "0_57"],
  ["😨", "0_58"],
  ["😰", "0_59"],
  ["😥", "0_60"],
  ["😓", "0_61"],
  ["🤗", "0_62"],
  ["🤔", "0_63"],
  ["🤭", "0_64"],
  ["🤫", "0_65"],
  ["🤥", "0_66"],
  ["😶", "0_67"],
  ["😐", "0_68"],
  ["😑", "0_69"],
  ["😬", "0_70"],
  ["🙄", "0_71"],
  ["😯", "0_72"],
  ["😦", "0_73"],
  ["😧", "0_74"],
  ["😮", "0_75"],
  ["😲", "0_76"],
  ["🥱", "0_77"],
  ["😴", "0_78"],
  ["🤤", "0_79"],
  ["😪", "0_80"],
  ["😵", "0_81"],
  ["🤐", "0_82"],
  ["🥴", "0_83"],
  ["🤢", "0_84"],
  ["🤮", "0_85"],
  ["🤧", "0_86"],
  ["😷", "0_87"],
  ["🤒", "0_88"],
  ["🤕", "0_89"],
  ["🤑", "0_90"],
  ["🤠", "0_91"],
  ["😈", "0_92"],
  ["👿", "0_93"],
  ["👹", "0_94"],
  ["👺", "0_95"],
  ["🤡", "0_96"],
  ["💩", "0_97"],
  ["👻", "0_98"],
  ["💀", "0_99"],
  ["☠️", "0_100"],
  ["👽", "0_101"],
  ["👾", "0_102"],
  ["🤖", "0_103"],
  ["🎃", "0_104"],
  ["😺", "0_105"],
  ["😸", "0_106"],
  ["😹", "0_107"],
  ["😻", "0_108"],
  ["😼", "0_109"],
  ["😽", "0_110"],
  ["🙀", "0_111"],
  ["😿", "0_112"],
  ["😾", "0_113"],
  ["👋", "0_114"],
  ["🤚", "0_115"],
  ["🖐", "0_116"],
  ["✋", "0_117"],
  ["🖖", "0_118"],
  ["👌", "0_119"],
  ["🤌", "0_120"],
  ["🤏", "0_121"],
  ["✌️", "0_122"],
  ["🤞", "0_123"],
  ["🤟", "0_124"],
  ["🤘", "0_125"],
  ["🤙", "0_126"],
  ["👈", "0_127"],
  ["👉", "0_128"],
  ["👆", "0_129"],
  ["🖕", "0_130"],
  ["👇", "0_131"],
  ["☝️", "0_132"],
  ["👍", "0_133"],
  ["👎", "0_134"],
  ["✊", "0_135"],
  ["👊", "0_136"],
  ["🤛", "0_137"],
  ["🤜", "0_138"],
  ["👏", "0_139"],
  ["🙌", "0_140"],
  ["👐", "0_141"],
  ["🤲", "0_142"],
  ["🤝", "0_143"],
  ["🙏", "0_144"],
  ["✍️", "0_145"],
  ["💪", "0_146"],
  ["🦾", "0_147"],
  ["🦶", "0_148"],
  ["👂", "0_149"],
  ["👃", "0_150"],
  ["💋", "0_151"],
]);

let customEmojiItems = loadCachedCustomItems() ?? builtinCustomItems();
const listeners = new Set<() => void>();

export const EMOJI_MAP = new Map<string, string>();
rebuildEmojiMap();

/** keyword → 静态资源 URL;非 emoji 返回 ""。 */
export function getEmojiImageUrl(keyword: string): string {
  return EMOJI_MAP.get(keyword) ?? "";
}

/**
 * 扫 text 找所有**出现过**的 emoji keyword(去重)。
 * O(N * keywords) — N 短(消息文本一般几百字符内),152 keyword 可接受。
 */
export function findEmojiKeywords(text: string): string[] {
  if (!text) return [];
  const found: string[] = [];
  for (const k of EMOJI_MAP.keys()) {
    if (text.includes(k)) found.push(k);
  }
  return found;
}

/**
 * 单独一个 custom emoji(trim 后)→ 返回 keyword 触发 large 渲染(120×120),
 * 对齐旧 `isLargeCustomEmoji`(emojiParts.length===1 && nonEmoji.length===0 &&
 * url.includes('/emoji/custom_'))。否则 null。
 */
export function getSingleCustomEmoji(text: string): string | null {
  const trimmed = text?.trim();
  if (!trimmed) return null;
  return customEmojiItems.some((item) => item.key === trimmed) ? trimmed : null;
}

export function getAllEmojiItems(): EmojiPickerItem[] {
  return [
    ...customEmojiItems,
    ...Array.from(UNICODE_EMOJI_MAP.entries()).map(([key, base]) => ({
      key,
      name: base,
      url: localImage(base),
    })),
  ];
}

export function subscribeEmojiManifest(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function loadEmojiManifest(): Promise<void> {
  try {
    const manifest = await getEmojiManifest({ silent: true });
    if (!Array.isArray(manifest.list)) return;
    const next = sanitizeManifestItems(manifest.list);
    if (sameCustomItems(next, customEmojiItems)) return;
    customEmojiItems = next;
    saveCachedCustomItems(next);
    rebuildEmojiMap();
    listeners.forEach((listener) => listener());
  } catch {
    // Keep the cached or built-in fallback.
  }
}

function rebuildEmojiMap(): void {
  EMOJI_MAP.clear();
  for (const item of customEmojiItems) EMOJI_MAP.set(item.key, item.url);
  for (const [key, base] of UNICODE_EMOJI_MAP) EMOJI_MAP.set(key, localImage(base));
}

function localImage(base: string): string {
  return `/emoji/${base}.png`;
}

function builtinCustomItems(): EmojiPickerItem[] {
  return BUILTIN_CUSTOM_EMOJIS.map((item) => ({
    key: item.key,
    name: item.name,
    url: localImage(item.base),
  }));
}

function sanitizeManifestItems(items: EmojiManifestItem[]): EmojiPickerItem[] {
  const fallbackByKey = new Map(builtinCustomItems().map((item) => [item.key, item]));
  const out: EmojiPickerItem[] = [];
  const seen = new Set<string>();
  for (const raw of items) {
    const key = typeof raw.key === "string" ? raw.key.trim() : "";
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const fallback = fallbackByKey.get(key);
    const url = sanitizeEmojiUrl(raw.url) || fallback?.url || "";
    if (!url) continue;
    out.push({
      key,
      name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : key,
      url,
    });
  }
  return out;
}

function sanitizeEmojiUrl(url?: string): string {
  if (!url) return "";
  const trimmed = url.trim();
  if (trimmed.startsWith("data:") && !trimmed.startsWith("data:image/")) return "";
  return trimmed;
}

function loadCachedCustomItems(): EmojiPickerItem[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(EMOJI_MANIFEST_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as EmojiPickerItem[];
    return sanitizeCachedItems(parsed);
  } catch {
    return null;
  }
}

function saveCachedCustomItems(items: EmojiPickerItem[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(EMOJI_MANIFEST_CACHE_KEY, JSON.stringify(items));
  } catch {
    // ignore
  }
}

function sanitizeCachedItems(items: EmojiPickerItem[]): EmojiPickerItem[] | null {
  if (!Array.isArray(items)) return null;
  const normalized = items
    .map((item) => ({
      key: typeof item.key === "string" ? item.key : "",
      name: typeof item.name === "string" ? item.name : "",
      url: sanitizeEmojiUrl(item.url),
    }))
    .filter((item) => item.key && item.url);
  return normalized.length > 0 ? normalized : null;
}

function sameCustomItems(a: EmojiPickerItem[], b: EmojiPickerItem[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
