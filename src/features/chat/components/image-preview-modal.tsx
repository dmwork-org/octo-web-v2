import { createPortal } from "react-dom";
import { Download, X } from "lucide-react";
import { triggerDownload } from "@/features/chat/lib/file-download";
import { useT } from "@/lib/i18n/use-t";

interface ImagePreviewModalProps {
  src: string;
  onClose: () => void;
}

function imageFileNameFromSrc(src: string): string {
  const dataMime = /^data:image\/([a-z0-9.+-]+)[;,]/i.exec(src);
  if (dataMime?.[1]) {
    const ext = dataMime[1].replace("svg+xml", "svg").replace("jpeg", "jpg");
    return `image.${ext}`;
  }

  try {
    const parsed = new URL(src, window.location.href);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const lastSegment = segments[segments.length - 1];
    if (!lastSegment) return "image";
    try {
      return decodeURIComponent(lastSegment);
    } catch {
      return lastSegment;
    }
  } catch {
    return "image";
  }
}

/**
 * 全屏图片预览 lightbox。
 *
 * Portal 到 document.body — 否则 inline render 被父级 stacking context 困住,
 * 无法盖兄弟的 composer / scroll-button / chat-side-panel(z-floating=100)。
 * 图片预览是全局 lightbox,需要盖住业务 dialog / 嵌套 dialog 里的消息内容,
 * 所以走 z-system-overlay。
 */
export function ImagePreviewModal({ src, onClose }: ImagePreviewModalProps) {
  const t = useT();
  const filename = imageFileNameFromSrc(src);
  return createPortal(
    <div
      className="fixed inset-0 z-system-overlay flex items-center justify-center bg-black"
      onClick={onClose}
      onContextMenu={(e) => e.preventDefault()}
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <button
          type="button"
          aria-label={t("imageRenderer.download")}
          title={t("imageRenderer.download")}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          onClick={(e) => {
            e.stopPropagation();
            void triggerDownload(src, filename);
          }}
        >
          <Download size={20} />
        </button>
        <button
          type="button"
          aria-label={t("imageRenderer.close")}
          title={t("imageRenderer.close")}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
        >
          <X size={20} />
        </button>
      </div>
      <img src={src} alt="" className="max-h-[100vh] max-w-[100vw] object-contain" />
    </div>,
    document.body,
  );
}
