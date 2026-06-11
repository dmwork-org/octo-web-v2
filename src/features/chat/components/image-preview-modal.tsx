import { createPortal } from "react-dom";
import { useEffect, useState, type MouseEvent, type PointerEvent } from "react";
import { Download, RotateCw, X, ZoomIn, ZoomOut } from "lucide-react";
import { triggerDownload } from "@/features/chat/lib/file-download";
import { useT } from "@/lib/i18n/use-t";

interface ImagePreviewModalProps {
  src: string;
  onClose: () => void;
}

const MIN_SCALE = 0.25;
const MAX_SCALE = 4;
const SCALE_STEP = 0.25;

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

function useBodyPointerEventsWhileMounted() {
  useEffect(() => {
    const previousPointerEvents = document.body.style.pointerEvents;
    document.body.style.pointerEvents = "auto";
    return () => {
      if (document.body.style.pointerEvents === "auto") {
        document.body.style.pointerEvents = previousPointerEvents;
      }
    };
  }, []);
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
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const filename = imageFileNameFromSrc(src);
  useBodyPointerEventsWhileMounted();

  const zoomOut = () => setScale((v) => Math.max(MIN_SCALE, Number((v - SCALE_STEP).toFixed(2))));
  const zoomIn = () => setScale((v) => Math.min(MAX_SCALE, Number((v + SCALE_STEP).toFixed(2))));
  const reset = () => {
    setScale(1);
    setRotation(0);
  };
  const rotate = () => setRotation((v) => (v + 90) % 360);
  const stopClose = (e: MouseEvent | PointerEvent) => {
    e.stopPropagation();
  };

  return createPortal(
    <div
      className="pointer-events-auto fixed inset-0 z-system-overlay flex items-center justify-center overflow-hidden bg-black/60"
      onContextMenu={(e) => e.preventDefault()}
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        aria-label={t("imageRenderer.close")}
        title={t("imageRenderer.close")}
        className="absolute top-4 right-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/35 text-white transition-colors hover:bg-black/55"
        onPointerDown={stopClose}
        onClick={(e) => {
          stopClose(e);
          onClose();
        }}
      >
        <X size={22} />
      </button>

      <div
        className="relative z-0 flex h-full w-full items-center justify-center overflow-auto p-8 pb-24"
        onClick={onClose}
      >
        <img
          src={src}
          alt=""
          className="max-h-[calc(100vh-120px)] max-w-[calc(100vw-64px)] object-contain transition-transform duration-150 ease-(--ease-emphasized)"
          style={{ transform: `scale(${scale}) rotate(${rotation}deg)` }}
          onClick={stopClose}
          onPointerDown={stopClose}
          draggable={false}
        />
      </div>

      <div
        className="absolute bottom-6 left-1/2 z-10 flex h-12 -translate-x-1/2 items-center gap-3 rounded-md bg-black/70 px-4 text-white shadow-lg"
        onClick={stopClose}
        onPointerDown={stopClose}
      >
        <button
          type="button"
          aria-label={t("imageRenderer.zoomOut")}
          title={t("imageRenderer.zoomOut")}
          disabled={scale <= MIN_SCALE}
          className="flex h-8 w-8 items-center justify-center rounded-sm text-white transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-35"
          onClick={(e) => {
            stopClose(e);
            zoomOut();
          }}
        >
          <ZoomOut size={19} />
        </button>
        <button
          type="button"
          aria-label={t("imageRenderer.resetSize")}
          title={t("imageRenderer.resetSize")}
          className="h-8 min-w-10 rounded-sm px-2 text-sm font-medium text-white transition-colors hover:bg-white/15"
          onClick={(e) => {
            stopClose(e);
            reset();
          }}
        >
          1:1
        </button>
        <button
          type="button"
          aria-label={t("imageRenderer.zoomIn")}
          title={t("imageRenderer.zoomIn")}
          disabled={scale >= MAX_SCALE}
          className="flex h-8 w-8 items-center justify-center rounded-sm text-white transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-35"
          onClick={(e) => {
            stopClose(e);
            zoomIn();
          }}
        >
          <ZoomIn size={19} />
        </button>
        <span className="h-7 w-px bg-white/25" />
        <button
          type="button"
          aria-label={t("imageRenderer.rotate")}
          title={t("imageRenderer.rotate")}
          className="flex h-8 w-8 items-center justify-center rounded-sm text-white transition-colors hover:bg-white/15"
          onClick={(e) => {
            stopClose(e);
            rotate();
          }}
        >
          <RotateCw size={19} />
        </button>
        <span className="h-7 w-px bg-white/25" />
        <button
          type="button"
          aria-label={t("imageRenderer.download")}
          title={t("imageRenderer.download")}
          className="flex h-8 w-8 items-center justify-center rounded-sm text-white transition-colors hover:bg-white/15"
          onClick={(e) => {
            stopClose(e);
            void triggerDownload(src, filename);
          }}
        >
          <Download size={19} />
        </button>
      </div>
    </div>,
    document.body,
  );
}
