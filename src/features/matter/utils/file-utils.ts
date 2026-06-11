/**
 * 文件类型图标 + 工具函数。
 * 对齐原始项目 getFileIcon() 行为，返回 SVG URL 字符串。
 */

// 文件类型图标（Vite 解析为 URL 字符串）
import defaultIcon from "@/features/chat/assets/files/default.svg";
import docIcon from "@/features/chat/assets/files/doc.svg";
import excelIcon from "@/features/chat/assets/files/excel.svg";
import gifIcon from "@/features/chat/assets/files/gif.svg";
import pdfIcon from "@/features/chat/assets/files/pdf.svg";
import videoIcon from "@/features/chat/assets/files/video.svg";
import zipIcon from "@/features/chat/assets/files/zip.svg";
import htmlIcon from "@/features/chat/assets/files/html.svg";
import mdIcon from "@/features/chat/assets/files/md.svg";
import txtIcon from "@/features/chat/assets/files/txt.svg";

/**
 * 根据文件名和 MIME 类型返回对应的文件图标 URL。
 * 对齐原始项目 getFileIcon() 的行为。
 */
export function getFileIcon(name: string, type: string): string {
  const dotIdx = name.lastIndexOf(".");
  const ext = dotIdx > 0 ? name.substring(dotIdx + 1).toLowerCase() : "";

  // 视频
  if (type.startsWith("video/") || ["mp4", "avi", "mov", "mkv", "webm"].includes(ext)) {
    return videoIcon;
  }
  // GIF
  if (ext === "gif") {
    return gifIcon;
  }
  // PDF
  if (ext === "pdf") {
    return pdfIcon;
  }
  // Word
  if (["doc", "docx"].includes(ext)) {
    return docIcon;
  }
  // Excel
  if (["xls", "xlsx"].includes(ext)) {
    return excelIcon;
  }
  // 压缩包
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) {
    return zipIcon;
  }
  // HTML
  if (["html", "htm"].includes(ext)) {
    return htmlIcon;
  }
  // Markdown
  if (ext === "md") {
    return mdIcon;
  }
  // 纯文本
  if (ext === "txt") {
    return txtIcon;
  }

  return defaultIcon;
}

/**
 * 格式化文件大小。
 * 对齐原始项目 formatFileSize() 的行为。
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
