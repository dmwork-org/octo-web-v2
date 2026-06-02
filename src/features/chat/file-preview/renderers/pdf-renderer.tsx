import { FileTooLarge } from "@/features/chat/file-preview/renderer-state";
import { isFileTooLarge } from "@/features/chat/file-preview/config";
import type { BaseRendererProps } from "@/features/chat/file-preview/types";

/**
 * PDF renderer — `<iframe>` 走浏览器原生 PDF.js(对齐旧 PdfRenderer 简化版):
 *   - 不引 `@react-pdf-viewer/*` 5 个三方包(避免 React 19 + Vite 兼容风险)
 *   - 浏览器原生 PDF viewer 已内置缩略图 / 翻页 / 缩放 / 搜索 / 打印
 *   - title 给 iframe 一个 a11y 标签
 *
 * **超大文件**(>20MB)走 FileTooLarge 兜底,不强行让浏览器加载(可能卡)。
 */
export function PdfRenderer({ file }: BaseRendererProps) {
  if (isFileTooLarge(file.size)) {
    return <FileTooLarge name={file.name} size={file.size} url={file.url} />;
  }
  return <iframe title={file.name} src={file.url} className="h-full w-full border-0 bg-bg-base" />;
}
