import { useState } from "react";
import { type Message } from "wukongimjssdk";
import { X } from "lucide-react";
import {
  RichTextBlockType,
  type RichTextBlock,
  type RichTextContent,
} from "@/features/base/im/richtext-content";
import { useT } from "@/lib/i18n/use-t";

interface RichTextRendererProps {
  message: Message;
}

const MAX_W = 400;
const MAX_H = 300;

/** URL allowlist:仅 http / https,过滤 javascript: / data: 等;不安全降级为占位,绝不渲染。 */
function isSafeUrl(url: string): boolean {
  try {
    const u = new URL(url, window.location.href);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * RichText(=14)图文混排消息(对齐上游 b1bb31df / Phase 1 接收渲染)。
 *
 * 按 content blocks 数组顺序穿插渲染 text / image 块:
 *   - text  block:纯文本(MVP 锁纯文本,跟上游 enableMarkdown=false 一致,避免
 *     web 渲 markdown 而移动端不渲的跨端不一致)
 *   - image block:url 经 isSafeUrl 校验(仅 http/https);不安全降级为文本占位,
 *     绝不渲染。点击全屏 lightbox 预览
 *
 * 未来 Phase 2:发送侧由 b5a3b68e 补,本 renderer 接收侧 + 转发场景已闭合。
 */
export function RichTextRenderer({ message }: RichTextRendererProps) {
  const content = message.content as RichTextContent;
  const blocks: RichTextBlock[] = content.content || [];

  return (
    <div className="flex flex-col gap-2">
      {blocks.map((blk, i) => {
        if (blk.type === RichTextBlockType.image) {
          return <RichTextImage key={`${message.clientMsgNo}-img-${i}`} block={blk} />;
        }
        const text = blk.text || "";
        if (text === "") return null;
        return (
          <div
            key={`${message.clientMsgNo}-text-${i}`}
            className="text-[14px] leading-[1.5] whitespace-pre-wrap break-words text-text-primary"
          >
            {text}
          </div>
        );
      })}
    </div>
  );
}

/**
 * RichText image block — url 安全校验 + 缩略图 + 全屏 lightbox 预览。
 *
 * url 不安全(非 http/https)走文本占位 `[图片]`,绝不渲染 img 元素(对齐上游 MarkdownImage)。
 */
function RichTextImage({ block }: { block: RichTextBlock }) {
  const t = useT();
  const [preview, setPreview] = useState(false);
  const url = block.url || "";
  if (!url || !isSafeUrl(url)) {
    return (
      <span className="inline-block rounded bg-bg-elevated px-2 py-1 text-[12px] text-text-tertiary">
        {t("message.digest.image")}
      </span>
    );
  }
  const naturalW = block.width || 200;
  const naturalH = block.height || 200;
  const ratio = Math.min(MAX_W / naturalW, MAX_H / naturalH, 1);
  const w = Math.round(naturalW * ratio);
  const h = Math.round(naturalH * ratio);
  return (
    <>
      <button
        type="button"
        onClick={() => setPreview(true)}
        className="block w-fit overflow-hidden rounded-lg bg-bg-elevated transition-opacity hover:opacity-90"
        aria-label={t("imageRenderer.viewLargeImage")}
      >
        <img
          src={url}
          alt={block.name || ""}
          width={w}
          height={h}
          className="block"
          style={{ maxWidth: MAX_W, maxHeight: MAX_H, objectFit: "contain" }}
        />
      </button>
      {preview ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => setPreview(false)}
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            aria-label={t("imageRenderer.close")}
            className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            onClick={(e) => {
              e.stopPropagation();
              setPreview(false);
            }}
          >
            <X size={20} />
          </button>
          <img src={url} alt="" className="max-h-screen max-w-screen" />
        </div>
      ) : null}
    </>
  );
}
