/**
 * 把后端搜索结果里的 <mark>xxx</mark> 标签安全渲染(对应旧
 * dmworkbase Components/GlobalSearch/sanitize)。
 *
 * 后端可能在 name / digest 等字段把匹配关键字包成 <mark>;前端用
 * dangerouslySetInnerHTML 渲染,所有其他 HTML 都转义防 XSS,仅保留
 * <mark>。
 */

const MARK_OPEN = "\x00MARK_OPEN\x00";
const MARK_CLOSE = "\x00MARK_CLOSE\x00";

export function sanitizeHighlight(html: string | undefined | null): string {
  if (!html) return "";

  let result = html.replace(/<mark>/gi, MARK_OPEN).replace(/<\/mark>/gi, MARK_CLOSE);

  result = result
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

  result = result
    .replace(new RegExp(MARK_OPEN, "g"), '<mark class="bg-warning/30 text-text-primary">')
    .replace(new RegExp(MARK_CLOSE, "g"), "</mark>");

  return result;
}
