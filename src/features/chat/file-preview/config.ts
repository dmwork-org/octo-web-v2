/**
 * FilePreviewPanel 公共配置(1:1 对齐旧 Components/FilePreviewPanel/config.ts)。
 *
 * 阈值集中,renderer 一致按字节数判定分级渲染。
 */

export const FILE_SIZE_THRESHOLD = {
  /** < 200KB:语法高亮渲染(对应旧 HIGHLIGHT) */
  HIGHLIGHT: 200 * 1024,
  /**
   * HTML / Markdown 源码高亮阈值 — 超过此值降级为纯文本(issue #156)。
   *
   * 这两种语言标签/标记密集,SyntaxHighlighter 同步解析开销远大于普通代码,
   * 200KB 阈值下切源码会明显卡顿。30KB 是经验值:覆盖大部分手写文档,
   * 大文件(生成 HTML / 长 README)降级纯文本避免主线程阻塞。
   */
  HIGHLIGHT_HEAVY: 30 * 1024,
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

/** 文本类 renderer 分级渲染模式(对齐旧 RenderMode)。 */
export type RenderMode = "highlight" | "plain" | "too-large";

/**
 * size → 渲染模式(对齐旧 getRenderMode):<200KB highlight / <2MB plain / 其他 too-large。
 *
 * **language 参数**(issue #156):html/markdown 等标签密集语言用更小的
 * `HIGHLIGHT_HEAVY` 阈值,超过即降级纯文本,避免 SyntaxHighlighter 同步解析卡顿。
 */
const HEAVY_LANGUAGES = new Set(["html", "markdown"]);

export function getRenderMode(size: number, language?: string): RenderMode {
  const highlightLimit =
    language && HEAVY_LANGUAGES.has(language)
      ? FILE_SIZE_THRESHOLD.HIGHLIGHT_HEAVY
      : FILE_SIZE_THRESHOLD.HIGHLIGHT;
  if (size <= highlightLimit) return "highlight";
  if (size <= FILE_SIZE_THRESHOLD.PLAIN_TEXT) return "plain";
  return "too-large";
}

/** 是否值得拉取文件内容(对齐旧 shouldFetchContent)。0=未知,试拉;超 20MB 不拉。 */
export function shouldFetchContent(fileSize: number): boolean {
  return fileSize === 0 || fileSize <= FILE_SIZE_THRESHOLD.MAX_PREVIEW;
}

/**
 * ext → 语法高亮 language(对齐旧 LANGUAGE_MAP + getLanguageFromExtension)。
 * 未命中直接返回 ext(SyntaxHighlighter 大多数 case 直接用 ext 也能识别)。
 */
const LANGUAGE_MAP: Record<string, string> = {
  js: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  py: "python",
  rb: "ruby",
  yml: "yaml",
  sh: "bash",
  bash: "bash",
  md: "markdown",
  markdown: "markdown",
};

export function getLanguageFromExtension(ext: string): string {
  const lower = ext.toLowerCase();
  return LANGUAGE_MAP[lower] || lower;
}
