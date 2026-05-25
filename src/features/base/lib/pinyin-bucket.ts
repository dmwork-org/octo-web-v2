import { pinyin } from "pinyin-pro";

/**
 * 把姓名首字符归到 A-Z 或 #(对应旧 dmworkcontacts/Contacts/index.tsx
 * getItemLetter,旧用 getPinyin(toSimplized(name))):
 *
 * - 英文 / 已是 A-Z 字母 → 大写返回
 * - 中文 → 取首字符 pinyin 首字母(toneType none,带 v 用 ü→v)
 * - 其他(数字 / 标点 / emoji)→ "#"
 *
 * pinyin-pro:轻量(<100KB),纯 JS 无 native 依赖;`pinyin(str, { pattern:
 * 'first', type: 'array' })` 返回每个字的拼音首字母数组,取第一个即可。
 */
export function bucketLetter(name: string): string {
  if (!name) return "#";
  const first = name.charAt(0);
  const upper = first.toUpperCase();
  if (/^[A-Z]$/.test(upper)) return upper;
  // 中文区间(基本 CJK)
  if (/[一-鿿]/.test(first)) {
    try {
      const py = pinyin(first, { pattern: "first", type: "string", toneType: "none" });
      const ch = (py || "").charAt(0).toUpperCase();
      if (/^[A-Z]$/.test(ch)) return ch;
    } catch {
      // ignore pinyin 异常,fallback #
    }
  }
  return "#";
}

/** 字母排序:A-Z 升序,# 永远最后。 */
export function sortLetters(a: string, b: string): number {
  if (a === "#") return 1;
  if (b === "#") return -1;
  return a.localeCompare(b);
}
