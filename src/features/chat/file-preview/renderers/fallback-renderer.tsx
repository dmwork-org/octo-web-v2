import { Download, File, FileAudio, FileImage, FileText, FileVideo, Info } from "lucide-react";
import { triggerDownload } from "@/features/chat/lib/file-download";
import { formatFileSize } from "@/features/chat/file-preview/config";
import type { BaseRendererProps } from "@/features/chat/file-preview/types";

/**
 * 兜底 renderer(1:1 对齐旧 FallbackRenderer):
 *   不支持预览的文件类型显示 icon + 名 + 大小 + 下载 + "暂不支持预览"提示。
 *   走到此 renderer:.docx / .xlsx / .pptx / .mp4 / .mp3 等。
 */

const FILE_TYPE_ICONS: Record<string, typeof File> = {
  doc: FileText,
  docx: FileText,
  ppt: FileText,
  pptx: FileText,
  xls: FileText,
  xlsx: FileText,
  png: FileImage,
  jpg: FileImage,
  jpeg: FileImage,
  gif: FileImage,
  bmp: FileImage,
  webp: FileImage,
  svg: FileImage,
  mp4: FileVideo,
  avi: FileVideo,
  mov: FileVideo,
  mkv: FileVideo,
  webm: FileVideo,
  mp3: FileAudio,
  wav: FileAudio,
  aac: FileAudio,
  flac: FileAudio,
  ogg: FileAudio,
};

function pickIcon(ext: string): typeof File {
  return FILE_TYPE_ICONS[ext.toLowerCase()] ?? File;
}

export function FallbackRenderer({ file }: BaseRendererProps) {
  const Icon = pickIcon(file.ext);
  const size = formatFileSize(file.size);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-6">
      <div className="flex w-full max-w-[320px] items-center gap-3 rounded-lg border border-border-default bg-bg-surface px-4 py-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-bg-elevated text-text-secondary">
          <Icon size={28} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="truncate text-sm font-medium text-text-primary" title={file.name}>
            {file.name || `file.${file.ext}`}
          </div>
          {size ? <div className="text-xs text-text-tertiary">{size}</div> : null}
        </div>
        <button
          type="button"
          onClick={() => void triggerDownload(file.url, file.name)}
          disabled={!file.url}
          className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md bg-bg-elevated px-2.5 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary disabled:cursor-default disabled:opacity-40"
        >
          <Download size={14} />
          <span>下载</span>
        </button>
      </div>
      <div className="inline-flex items-center gap-1.5 text-xs text-text-tertiary">
        <Info size={14} />
        <span>暂不支持预览此文件类型</span>
      </div>
    </div>
  );
}
