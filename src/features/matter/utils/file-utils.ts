import {
  File,
  FileText,
  FileSpreadsheet,
  FileImage,
  FileVideo,
  FileArchive,
  FileCode,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * 根据文件名和 MIME 类型返回对应的 lucide-react 图标组件。
 * 对齐原始项目 getFileIcon() 的行为，但用 lucide 组件替代 SVG 文件。
 */
export function getFileIcon(name: string, type: string): LucideIcon {
  const dotIdx = name.lastIndexOf(".");
  const ext = dotIdx > 0 ? name.substring(dotIdx + 1).toLowerCase() : "";

  // 视频
  if (type.startsWith("video/") || ["mp4", "avi", "mov", "mkv", "webm"].includes(ext)) {
    return FileVideo;
  }
  // 图片
  if (
    type.startsWith("image/") ||
    ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"].includes(ext)
  ) {
    return FileImage;
  }
  // PDF
  if (ext === "pdf") {
    return FileText;
  }
  // Word
  if (["doc", "docx"].includes(ext)) {
    return FileText;
  }
  // Excel
  if (["xls", "xlsx", "csv"].includes(ext)) {
    return FileSpreadsheet;
  }
  // 压缩包
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) {
    return FileArchive;
  }
  // 代码/网页
  if (["html", "htm", "js", "ts", "tsx", "jsx", "css", "json"].includes(ext)) {
    return FileCode;
  }
  // 文本/Markdown
  if (["txt", "md"].includes(ext)) {
    return FileText;
  }

  return File;
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
