import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useT } from "@/lib/i18n/use-t";

interface ImagePreviewModalProps {
  src: string;
  onClose: () => void;
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
  return createPortal(
    <div
      className="fixed inset-0 z-system-overlay flex items-center justify-center bg-black"
      onClick={onClose}
      onContextMenu={(e) => e.preventDefault()}
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        aria-label={t("imageRenderer.close")}
        className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        <X size={20} />
      </button>
      <img src={src} alt="" className="max-h-[100vh] max-w-[100vw] object-contain" />
    </div>,
    document.body,
  );
}
