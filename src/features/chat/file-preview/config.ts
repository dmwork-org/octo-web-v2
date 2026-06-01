/**
 * FilePreviewPanel 公共配置(1:1 对齐旧 Components/FilePreviewPanel/config.ts)。
 *
 * 阈值集中,renderer 一致按字节数判定分级渲染。
 */

export const FILE_SIZE_THRESHOLD = {
  /** < 200KB:语法高亮渲染(对应旧 HIGHLIGHT) */
  HIGHLIGHT: 200 * 1024,
  /** < 2MB:纯文本渲染(对应旧 PLAIN_TEXT) */
  PLAIN_TEXT: 2 * 1024 * 1024,
  /** < 20MB:允许预览(超过则提示下载,对应旧 MAX_PREVIEW) */
  MAX_PREVIEW: 20 * 1024 * 1024,
  /** Markdown 预览阈值 — > 200KB 切源码模式(P4 不实现,字段保留) */
  MARKDOWN_PREVIEW: 200 * 1024,
} as const;

/** 字节 → 人类可读(对齐旧 formatFileSize)。 */
export function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/** 文件超大判定 — 大于此阈值禁用 in-panel 预览。 */
export function isFileTooLarge(size?: number): boolean {
  return !!size && size > FILE_SIZE_THRESHOLD.MAX_PREVIEW;
}
