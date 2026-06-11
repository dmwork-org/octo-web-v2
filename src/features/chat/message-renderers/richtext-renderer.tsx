import { useState } from "react";
import { type Mention, type Message } from "wukongimjssdk";
import {
  RichTextBlockType,
  type RichTextBlock,
  type RichTextContent,
} from "@/features/base/im/richtext-content";
import { ImagePreviewModal } from "@/features/chat/components/image-preview-modal";
import { MentionAwareText } from "@/features/chat/lib/mention-aware-text";
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
 * RichText(=14)图文混排消息(对齐上游 b1bb31df 接收 + fff36eb1 UI 迁移 / file 前向兼容)。
 *
 * 按 content blocks 数组顺序穿插渲染 text / image / file 块:
 *   - text  block:plain text + @ 高亮 + 安全外链高亮;
 *     MVP 锁 markdown(跟上游 enableMarkdown=false 一致,避免 web/mobile 差异)
 *   - image block:url 经 isSafeUrl 校验(仅 http/https);不安全降级为文本占位,
 *     绝不渲染。点击全屏 lightbox 预览
 *   - file  block:前向兼容(fff36eb1)接收渲染,发送侧暂不构造 file block;
 *     只显示 📎 + 文件名,不接预览/下载入口
 *
 * mention 数据从 message.content.mention 取(send-content-proxy 注入到 RichTextContent),
 * 所有 text block 共用同一份 mention,按各自 text 内容匹配高亮。
 */
export function RichTextRenderer({ message }: RichTextRendererProps) {
  const content = message.content as RichTextContent;
  const blocks: RichTextBlock[] = content.content || [];
  const mention = (content as RichTextContent & { mention?: Mention }).mention;

  return (
    <div className="flex flex-col gap-2">
      {blocks.map((blk, i) => {
        if (blk.type === RichTextBlockType.image) {
          return <RichTextImage key={`${message.clientMsgNo}-img-${i}`} block={blk} />;
        }
        if (blk.type === RichTextBlockType.file) {
          return <RichTextFile key={`${message.clientMsgNo}-file-${i}`} block={blk} />;
        }
        const text = blk.text || "";
        if (text === "") return null;
        return (
          <div
            key={`${message.clientMsgNo}-text-${i}`}
            className="text-[14px] leading-[1.5] whitespace-pre-wrap break-words text-text-primary"
          >
            <MentionAwareText text={text} mention={mention} linkify />
          </div>
        );
      })}
    </div>
  );
}

/**
 * RichText image block — url 安全校验 + 缩略图 + 全屏 lightbox 预览。
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
      {preview ? <ImagePreviewModal src={url} onClose={() => setPreview(false)} /> : null}
    </>
  );
}

/**
 * RichText file block — 前向兼容简单卡片(对齐上游 fff36eb1)。
 * 发送侧暂不构造 file block;接收侧只渲染文件名 + 📎,不接预览/下载入口
 * (待 octo-lib/backend 契约支持后再补完整 file 卡片)。
 */
function RichTextFile({ block }: { block: RichTextBlock }) {
  const t = useT();
  const name = block.name || t("message.digest.file");
  return (
    <div className="inline-flex items-center gap-2 rounded-md bg-bg-elevated px-3 py-2 text-[13px] text-text-secondary">
      <span className="text-text-tertiary">📎</span>
      <span className="truncate">{name}</span>
    </div>
  );
}
