import { useState } from "react";
import { Download, File, FileAudio, FileImage, FileText, FileVideo, Info, Loader2 } from "lucide-react";
import { triggerDownload } from "@/features/chat/lib/file-download";
import { formatFileSize } from "@/features/chat/file-preview/config";
import type { BaseRendererProps } from "@/features/chat/file-preview/types";
import { useT } from "@/lib/i18n/use-t";

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
  const t = useT();
  const Icon = pickIcon(file.ext);
  const size = formatFileSize(file.size);
  // 下载点击反馈:对齐老仓 500ms loading 指示(避免连续点 + 给用户即时反馈)
  const [downloading, setDownloading] = useState(false);
  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      await triggerDownload(file.url, file.name);
    } finally {
      setTimeout(() => setDownloading(false), 500);
    }
  };
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
          onClick={handleDownload}
          disabled={!file.url || downloading}
          className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md bg-bg-elevated px-2.5 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary disabled:cursor-default disabled:opacity-40"
        >
          {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          <span>{t("filePreview.download")}</span>
        </button>
      </div>
      <div className="inline-flex items-center gap-1.5 text-xs text-text-tertiary">
        <Info size={14} />
        <span>{t("filePreview.unsupportedType")}</span>
      </div>
    </div>
  );
}
