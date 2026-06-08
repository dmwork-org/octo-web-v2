import { AlertTriangle, Download, Info, Loader2 } from "lucide-react";
import { triggerDownload } from "@/features/chat/lib/file-download";
import { formatFileSize } from "@/features/chat/file-preview/config";
import { useT } from "@/lib/i18n/use-t";

/**
 * Renderer 通用 Loading / Error / Empty / FileTooLarge UI(1:1 对齐旧
 * Components/FilePreviewPanel/renderers/RendererState + FileTooLarge):
 *
 * 各 renderer 复用此 4 个状态视图,避免 loading spinner / error 提示
 * 各写各的。
 */

export function RendererLoading({ message }: { message?: string }) {
  const t = useT();
  const text = message ?? t("filePreview.loading");
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-text-tertiary">
      <Loader2 size={20} className="animate-spin" />
      <span className="text-sm">{text}</span>
    </div>
  );
}

export function RendererError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const t = useT();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <AlertTriangle size={32} className="text-error" />
      <div className="text-sm text-text-secondary">{message}</div>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="cursor-pointer rounded-md border border-border-default px-3 py-1 text-xs text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
        >
          {t("filePreview.retry")}
        </button>
      ) : null}
    </div>
  );
}

export function RendererEmpty({ message }: { message?: string }) {
  const t = useT();
  const text = message ?? t("filePreview.empty");
  return (
    <div className="flex h-full items-center justify-center text-sm text-text-tertiary">{text}</div>
  );
}

/**
 * 文件超大兜底视图(对齐旧 FileTooLarge):
 *   提示文件超过预览阈值 + 名 + 大小 + 下载按钮。
 */
export function FileTooLarge({ name, size, url }: { name: string; size?: number; url: string }) {
  const t = useT();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <Info size={32} className="text-text-tertiary" />
      <div className="text-sm font-medium text-text-primary">
        {t("filePreview.tooLargeNotPreviewable")}
      </div>
      <div className="flex flex-col items-center gap-1 text-xs text-text-tertiary">
        <span className="max-w-[260px] truncate">{name}</span>
        {size ? <span>{formatFileSize(size)}</span> : null}
      </div>
      <button
        type="button"
        onClick={() => void triggerDownload(url, name)}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border-default px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
      >
        <Download size={14} />
        <span>{t("filePreview.download")}</span>
      </button>
    </div>
  );
}
