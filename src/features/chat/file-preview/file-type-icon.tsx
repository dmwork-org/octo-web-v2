import defaultIcon from "@/features/chat/assets/files/default.svg";
import docIcon from "@/features/chat/assets/files/doc.svg";
import excelIcon from "@/features/chat/assets/files/excel.svg";
import gifIcon from "@/features/chat/assets/files/gif.svg";
import htmlIcon from "@/features/chat/assets/files/html.svg";
import mdIcon from "@/features/chat/assets/files/md.svg";
import pdfIcon from "@/features/chat/assets/files/pdf.svg";
import txtIcon from "@/features/chat/assets/files/txt.svg";
import videoIcon from "@/features/chat/assets/files/video.svg";
import zipIcon from "@/features/chat/assets/files/zip.svg";

/**
 * 文件类型 icon — 1:1 复刻旧 dmworkbase getFileIcon 映射 + 老仓 SVG 资产(真彩色文件袋:
 * MD 米黄折角 / code 黑底紫 / DOC 蓝 / PDF 红 / XLS 绿 / ZIP 黄 / VIDEO 紫 ...)。
 *
 * 用 import + <img> 让 Vite 把 SVG 当资产打包(走 @rollup/plugin-image 默认行为)。
 * 比内嵌 SVG 节点优势:① 跟老仓视觉完全一致(同一份源文件);② 浏览器缓存友好;
 * ③ 不污染 React 树。
 */
interface FileTypeIconProps {
  /** ext 串(不带点;大写小写都行,内部 toLowerCase)。 */
  extension: string;
  /** 渲染像素尺寸,默认 40。20 用于 header,40 用于卡片,48 用于 composer 卡。 */
  size?: number;
}

function iconOf(ext: string): string {
  const e = ext.toLowerCase();
  if (["mp4", "avi", "mov", "mkv", "webm"].includes(e)) return videoIcon;
  if (e === "gif") return gifIcon;
  if (e === "pdf") return pdfIcon;
  if (e === "doc" || e === "docx") return docIcon;
  if (e === "xls" || e === "xlsx") return excelIcon;
  if (["zip", "rar", "7z", "tar", "gz"].includes(e)) return zipIcon;
  if (e === "html" || e === "htm") return htmlIcon;
  if (e === "md") return mdIcon;
  if (e === "txt") return txtIcon;
  return defaultIcon;
}

export function FileTypeIcon({ extension, size = 40 }: FileTypeIconProps) {
  const src = iconOf(extension);
  // 用 style + max-w/h 双保险:不同 SVG viewBox(48/32/27 等)在 img attr 下表现
  // 不一致,显式 inline style 限定 box,确保跟旧 .wk-attachment-node-icon img
  // (48×48 + object-fit: contain)等效。
  return (
    <img
      src={src}
      alt={extension}
      draggable={false}
      style={{ width: size, height: size }}
      className="block max-h-full max-w-full shrink-0 object-contain"
    />
  );
}
