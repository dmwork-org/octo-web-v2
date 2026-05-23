import { useState } from "react";
import { useStore } from "@tanstack/react-store";
import { type Message, type MessageImage } from "wukongimjssdk";
import { X } from "lucide-react";
import { authStore } from "@/features/base/stores/auth";

interface ImageRendererProps {
  message: Message;
}

/**
 * 图片消息(MessageContentType.image)。
 * 缩略图最大 240×320,点击全屏预览(简单 overlay,P4 接 ImageToolbar 完整工具栏)。
 */
export function ImageRenderer({ message }: ImageRendererProps) {
  const me = useStore(authStore, (s) => s.user?.uid ?? null);
  const isSelf = me !== null && message.fromUID === me;
  const image = message.content as MessageImage;
  const [preview, setPreview] = useState(false);

  const src = image.url || "";
  const naturalW = image.width || 200;
  const naturalH = image.height || 200;
  // 等比缩放到 240×320 框内
  const ratio = Math.min(240 / naturalW, 320 / naturalH, 1);
  const w = Math.round(naturalW * ratio);
  const h = Math.round(naturalH * ratio);

  return (
    <>
      <div className={`flex w-full ${isSelf ? "justify-end" : "justify-start"}`}>
        <button
          type="button"
          onClick={() => src && setPreview(true)}
          className="overflow-hidden rounded-md bg-bg-elevated"
          aria-label="查看大图"
        >
          {src ? (
            <img
              src={src}
              alt=""
              width={w}
              height={h}
              className="block"
              style={{ maxWidth: 240, maxHeight: 320, objectFit: "contain" }}
            />
          ) : (
            <div className="flex h-32 w-32 items-center justify-center text-xs text-text-tertiary">
              图片加载中…
            </div>
          )}
        </button>
      </div>
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
