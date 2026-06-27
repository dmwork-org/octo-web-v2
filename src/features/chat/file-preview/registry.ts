import { CodeRenderer } from "@/features/chat/file-preview/renderers/code-renderer";
import { ExcelRenderer } from "@/features/chat/file-preview/renderers/excel-renderer";
import { FallbackRenderer } from "@/features/chat/file-preview/renderers/fallback-renderer";
import { HtmlRenderer } from "@/features/chat/file-preview/renderers/html-renderer";
import { ImageRenderer } from "@/features/chat/file-preview/renderers/image-renderer";
import { JsonRenderer } from "@/features/chat/file-preview/renderers/json-renderer";
import { JsonlRenderer } from "@/features/chat/file-preview/renderers/jsonl-renderer";
import { MarkdownRenderer } from "@/features/chat/file-preview/renderers/markdown-renderer";
import { PdfRenderer } from "@/features/chat/file-preview/renderers/pdf-renderer";
import { TextRenderer } from "@/features/chat/file-preview/renderers/text-renderer";
import { VideoRenderer } from "@/features/chat/file-preview/renderers/video-renderer";
import {
  type FileRenderer,
  type FileType,
  type RendererRegistryItem,
  getExtension,
} from "@/features/chat/file-preview/types";

/**
 * Renderer 注册表(1:1 对齐旧 Components/FilePreviewPanel/registry.ts)。
 *
 * 策略模式核心:扩展名 → renderer 映射 + needsFetch 标记(供 panel 决定是否预加载文本)。
 *
 * **覆盖范围(全 10 个 type)**:
 *   image / pdf / fallback     — commit 2(不需 fetch)
 *   markdown / text / code     — commit 3(需 fetch 文本)
 *   json / jsonl / excel / html — commit 4(本)
 *
 * **明确不支持**(走 fallback):.docx / .pptx / .doc / .ppt 等 Office binary、
 * .mp3 等音频(对话流内有专门 renderer)。
 */

class FileRendererRegistry {
  private map = new Map<string, RendererRegistryItem>();
  private fallback: FileRenderer = FallbackRenderer;

  constructor() {
    this.register({
      type: "image",
      extensions: ["png", "jpg", "jpeg", "gif", "bmp", "webp", "svg"],
      renderer: ImageRenderer,
      needsFetch: false,
    });
    this.register({
      type: "video",
      extensions: ["mp4", "m4v", "mov", "webm", "ogv", "ogg"],
      renderer: VideoRenderer,
      needsFetch: false,
    });
    this.register({
      type: "pdf",
      extensions: ["pdf"],
      renderer: PdfRenderer,
      needsFetch: false,
    });
    this.register({
      type: "markdown",
      extensions: ["md", "markdown"],
      renderer: MarkdownRenderer,
      needsFetch: true,
    });
    this.register({
      type: "text",
      extensions: ["txt", "log", "ini", "conf", "cfg"],
      renderer: TextRenderer,
      needsFetch: true,
    });
    // Code — 25 个高频扩展(1:1 对齐旧 registry.ts code 项)
    this.register({
      type: "code",
      extensions: [
        "js",
        "jsx",
        "ts",
        "tsx",
        "css",
        "scss",
        "less",
        "xml",
        "yaml",
        "yml",
        "py",
        "java",
        "c",
        "cpp",
        "h",
        "hpp",
        "go",
        "rs",
        "rb",
        "php",
        "sh",
        "bash",
        "sql",
        "vue",
        "svelte",
      ],
      renderer: CodeRenderer,
      needsFetch: true,
    });
    this.register({
      type: "json",
      extensions: ["json"],
      renderer: JsonRenderer,
      needsFetch: true,
    });
    this.register({
      type: "jsonl",
      extensions: ["jsonl"],
      renderer: JsonlRenderer,
      needsFetch: true,
    });
    this.register({
      type: "excel",
      extensions: ["csv", "xlsx", "xls", "xlsb", "xlsm"],
      renderer: ExcelRenderer,
      needsFetch: true,
    });
    this.register({
      type: "html",
      extensions: ["html", "htm"],
      renderer: HtmlRenderer,
      needsFetch: true,
    });
  }

  register(item: RendererRegistryItem) {
    for (const ext of item.extensions) {
      this.map.set(ext.toLowerCase(), item);
    }
  }

  /** ext + filename 二选一查;未命中返回 fallback item(type=unknown)。 */
  getRenderer(ext: string, name?: string): RendererRegistryItem {
    const key = getExtension(ext, name);
    return (
      this.map.get(key) ?? {
        type: "unknown" as FileType,
        extensions: [],
        renderer: this.fallback,
        needsFetch: false,
      }
    );
  }

  canPreview(ext: string, name?: string): boolean {
    return this.map.has(getExtension(ext, name));
  }
}

export const fileRendererRegistry = new FileRendererRegistry();
