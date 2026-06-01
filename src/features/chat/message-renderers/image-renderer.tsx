import { useState } from "react";
import { type Message, type MessageImage } from "wukongimjssdk";
import { X } from "lucide-react";

interface ImageRendererProps {
  message: Message;
}

// 对齐旧 SingleImage(packages/dmworkbase/src/ui/message/ImageContent/SingleImage.tsx)
const MAX_W = 660; // 旧 FALLBACK_MAX_WIDTH
const MAX_H = 372; // 旧 MAX_HEIGHT

/**
 * 图片消息(Slack 风格 — 直接缩略图,无气泡)。
 *
 * 视觉对齐旧 SingleImage + ImageContent/index.css:
 * - 缩略图框 max 660 × 372,等比缩放(Figma 334:14414)
 * - radius 16px(`--wk-r-lg`,新仓 `rounded-lg`)
 * - bg `#F2F3F4`(图片加载/透明占位)
 * - hover opacity 0.9 + transition
 *
 * 点击 overlay 全屏预览(P5 接 lightbox 完整工具栏)。
 */
export function ImageRenderer({ message }: ImageRendererProps) {
  const image = message.content as MessageImage;
  const [preview, setPreview] = useState(false);

  const src = image.url || "";
  const naturalW = image.width || 200;
  const naturalH = image.height || 200;
  const ratio = Math.min(MAX_W / naturalW, MAX_H / naturalH, 1);
  const w = Math.round(naturalW * ratio);
  const h = Math.round(naturalH * ratio);

  return (
    <>
      <button
        type="button"
        onClick={() => src && setPreview(true)}
        className="overflow-hidden rounded-lg bg-bg-elevated transition-opacity hover:opacity-90"
        aria-label="查看大图"
      >
        {src ? (
          <img
            src={src}
            alt=""
            width={w}
            height={h}
            className="block"
            style={{ maxWidth: MAX_W, maxHeight: MAX_H, objectFit: "contain" }}
          />
        ) : (
          <div className="flex h-32 w-32 items-center justify-center text-xs text-text-tertiary">
            图片加载中…
          </div>
        )}
      </button>
      {preview && src ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => setPreview(false)}
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            aria-label="关闭"
            className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            onClick={(e) => {
              e.stopPropagation();
              setPreview(false);
            }}
          >
            <X size={20} />
          </button>
          <img src={src} alt="" className="max-h-screen max-w-screen" />
        </div>
      ) : null}
    </>
  );
}
