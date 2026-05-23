import { type Message } from "wukongimjssdk";
import { File as FileIcon, Download } from "lucide-react";
import { useStore } from "@tanstack/react-store";
import { type FileContent } from "@/features/base/im/file-content";
import { authStore } from "@/features/base/stores/auth";

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
 * 文件消息(MessageContentTypeConst.file = 8)。
 * 简化版:icon + 名字 + 大小 + 下载按钮(对应旧 Messages/File 不带预览,
 * PDF / 文本预览延后到 P4 接 FilePreviewPanel/PdfViewer)。
 */
export function FileRenderer({ message }: FileRendererProps) {
  const me = useStore(authStore, (s) => s.user?.uid ?? null);
  const isSelf = me !== null && message.fromUID === me;
  const content = message.content as FileContent;
  const url = content.url || content.remoteUrl || "";

  return (
    <div className={`flex w-full ${isSelf ? "justify-end" : "justify-start"}`}>
      <div
        className={`flex max-w-[320px] items-center gap-3 rounded-md p-3 ${
          isSelf ? "bg-bg-selected" : "bg-bg-elevated"
        }`}
      >
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
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-text-secondary hover:bg-bg-hover disabled:opacity-40"
        >
          <Download size={16} />
        </button>
      </div>
    </div>
  );
}
