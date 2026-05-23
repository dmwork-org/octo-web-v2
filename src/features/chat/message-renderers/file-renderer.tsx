import { type Message } from "wukongimjssdk";
import { File as FileIcon, Download } from "lucide-react";
import { type FileContent } from "@/features/base/im/file-content";

interface FileRendererProps {
  message: Message;
}

function formatSize(bytes: number): string {
  if (bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function downloadFile(url: string, name: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = name || "file";
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * 文件消息(Slack 风格 — 卡片,无 self/other 颜色区分)。
 * P4 加 PDF 内嵌预览 / 文件类型 icon 配色(对应旧 getFileIconInfo)。
 */
export function FileRenderer({ message }: FileRendererProps) {
  const content = message.content as FileContent;
  const url = content.url || content.remoteUrl || "";

  return (
    <div className="flex max-w-[360px] items-center gap-3 rounded-md border border-border-default bg-bg-elevated p-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-bg-surface text-text-secondary">
        <FileIcon size={20} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="truncate text-sm font-medium text-text-primary" title={content.name}>
          {content.name || "未知文件"}
        </div>
        <div className="flex gap-2 text-[11px] text-text-tertiary">
          <span>{formatSize(content.size)}</span>
          {content.ext ? <span>{content.ext.toUpperCase()}</span> : null}
        </div>
      </div>
      <button
        type="button"
        aria-label="下载"
        title="下载"
        disabled={!url}
        onClick={() => url && downloadFile(url, content.name)}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary disabled:opacity-40"
      >
        <Download size={16} />
      </button>
    </div>
  );
}
