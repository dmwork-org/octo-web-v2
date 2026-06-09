import { MessageContent } from "wukongimjssdk";
import { MessageContentTypeConst } from "@/features/base/im/content-types";
import { t } from "@/lib/i18n/instance";

/**
 * RichText(=14) 图文混排正文(对齐上游 b1bb31df / Phase 1 接收渲染)。
 *
 * payload 结构(对齐 octo-lib common/richtext.go):
 *   { type: 14, content: [ {type:"text",text} | {type:"image",url,width,height} ], plain }
 *   - content: 有序数组,顺序即图文穿插顺序
 *   - plain:   冗余纯文本,server 权威生成,复制/引用预览/搜索复用
 *
 * 向后兼容:老 payload content 可能是纯字符串,归一为单个 text block。
 */

/** RichText 图文混排 block 类型(对齐 octo-lib RichTextBlockType)。 */
export const RichTextBlockType = {
  text: "text",
  image: "image",
} as const;

/** plain 生成时 image block 注入的占位符(必须与 octo-lib RichTextImagePlaceholder 字节对齐)。 */
export const RichTextImagePlaceholder = "[图片]";

export interface RichTextBlock {
  type: string;
  /** text block 文本内容。 */
  text?: string;
  /** image block 图片地址(scheme allowlist 仅 http/https)。 */
  url?: string;
  width?: number;
  height?: number;
  size?: number;
  name?: string;
}

interface RichTextJSON {
  content?: unknown;
  plain?: unknown;
}

/**
 * 遍历 blocks 生成纯文本(对齐 octo-lib BuildRichTextPlain):
 *   text  → text;image → RichTextImagePlaceholder;未知 type 取 text 兜底。
 */
export function buildRichTextPlain(content: RichTextBlock[]): string {
  let out = "";
  for (const blk of content) {
    if (blk.type === RichTextBlockType.image) {
      out += RichTextImagePlaceholder;
    } else if (blk.type === RichTextBlockType.text) {
      out += blk.text || "";
    } else if (blk.text) {
      out += blk.text;
    }
  }
  return out;
}

export class RichTextContent extends MessageContent {
  content: RichTextBlock[] = [];
  plain = "";

  decodeJSON(content: RichTextJSON): void {
    const raw = content?.content;
    if (Array.isArray(raw)) {
      this.content = raw.map((blk: Partial<RichTextBlock>) => ({
        type: blk?.type ?? "",
        text: blk?.text,
        url: blk?.url,
        width: blk?.width,
        height: blk?.height,
        size: blk?.size,
        name: blk?.name,
      }));
    } else if (typeof raw === "string") {
      // 老版本 content 是纯字符串:归一为单 text block
      this.content = raw ? [{ type: RichTextBlockType.text, text: raw }] : [];
    } else {
      this.content = [];
    }
    this.plain = typeof content?.plain === "string" ? content.plain : "";
    // plain 缺失(老 payload / 字符串 content)现场回填,保证复制/引用预览不丢字
    if (this.plain.trim() === "") {
      this.plain = buildRichTextPlain(this.content);
    }
  }

  encodeJSON(): RichTextJSON {
    return { content: this.content, plain: this.plain };
  }

  get contentType(): number {
    return MessageContentTypeConst.richText;
  }

  /** 引用预览 / 会话摘要:优先 server plain → 现场回填 → 静态"富文本消息"兜底。 */
  get conversationDigest(): string {
    if (this.plain.trim() !== "") return this.plain;
    const fallback = buildRichTextPlain(this.content);
    if (fallback !== "") return fallback;
    return t("message.digest.richText");
  }
}

/** 构造 text block(对齐上游 b5a3b68e makeTextBlock)。 */
export function makeTextBlock(text: string): RichTextBlock {
  return { type: RichTextBlockType.text, text };
}

/**
 * 构造 image block(对齐上游 b5a3b68e makeImageBlock)。
 * 调用方负责 url 安全校验(isSafeUrl),本函数不重校验。
 */
export function makeImageBlock(input: {
  url: string;
  width?: number;
  height?: number;
  size?: number;
  name?: string;
}): RichTextBlock {
  return {
    type: RichTextBlockType.image,
    url: input.url,
    width: input.width,
    height: input.height,
    size: input.size,
    name: input.name,
  };
}

/**
 * 从 blocks 构造 RichTextContent(对齐上游 createRichTextContent)。
 * plain 用本地 buildRichTextPlain 占位;server 端 #232 Finalize 会重新生成并 overwrite。
 */
export function createRichTextContent(blocks: RichTextBlock[]): RichTextContent {
  const c = new RichTextContent();
  c.content = blocks;
  c.plain = buildRichTextPlain(blocks);
  return c;
}
