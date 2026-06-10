import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useT } from "@/lib/i18n/use-t";

interface ImagePreviewModalProps {
  src: string;
  onClose: () => void;
}

// Portal 到 body 逃离父 stacking context;inline style 绕过 tailwind v4 @utility
// (z-dialog/bg-black 等)在 vite-plus dev 不生成的问题,根治后可换回 token。
const overlayStyle: React.CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 1000,
  backgroundColor: "#000",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const imgStyle: React.CSSProperties = {
  maxWidth: "100vw",
  maxHeight: "100vh",
  objectFit: "contain",
};

export function ImagePreviewModal({ src, onClose }: ImagePreviewModalProps) {
  const t = useT();
  return createPortal(
    <div
      style={overlayStyle}
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
      <img src={src} alt="" style={imgStyle} />
    </div>,
    document.body,
  );
}
