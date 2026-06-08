import { useStore } from "@tanstack/react-store";
import { type Message } from "wukongimjssdk";
import { endpointStore } from "@/features/base/stores/endpoint";
import { GifContent } from "@/features/base/im/gif-content";
import { useT } from "@/lib/i18n/use-t";

/**
 * GIF 动图渲染(对应旧 dmworkbase Messages/Gif GifCell):
 *   原图比例缩放到 max 200×200,直接 <img> 显示(GIF 浏览器原生 autoplay)。
 *
 * url 兼容:相对路径 → 拼 baseURL;绝对 url(http/data:) 直接用。
 *
 * 不做(P3+):点击大图预览(对齐 image-renderer 后续一起补)。
 */
function imageScale(
  orgW: number,
  orgH: number,
  maxW = 200,
  maxH = 200,
): { width: number; height: number } {
  if (!orgW || !orgH) return { width: maxW, height: maxH };
  if (orgW > maxW && orgW >= orgH) {
    return { width: maxW, height: Math.round((orgH * maxW) / orgW) };
  }
  if (orgH > maxH && orgH > orgW) {
    return { width: Math.round((orgW * maxH) / orgH), height: maxH };
  }
  return { width: orgW, height: orgH };
}

function resolveUrl(url: string, baseURL: string): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:"))
    return url;
  return `${baseURL}/${url.replace(/^\/+/, "")}`;
}

interface GifRendererProps {
  message: Message;
}

export function GifRenderer({ message }: GifRendererProps) {
  const t = useT();
  const baseURL = useStore(endpointStore, (s) => s.baseURL);
  const content = message.content as GifContent;
  const url = resolveUrl(content.url, baseURL);
  const { width, height } = imageScale(content.width, content.height);

  if (!url) {
    return (
      <span className="rounded bg-bg-elevated px-2 py-1 text-[11px] text-text-tertiary">
        {t("message.digest.gif")}
      </span>
    );
  }
  return (
    <img
      src={url}
      alt="gif"
      width={width}
      height={height}
      style={{ width, height }}
      className="rounded-md object-contain"
      loading="lazy"
      draggable={false}
    />
  );
}
