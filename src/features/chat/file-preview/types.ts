/**
 * 文件预览公共类型(1:1 对齐旧 dmworkbase Components/FilePreviewPanel/types.ts)。
 *
 * **字段命名**:`ext` 而非旧仓 `extension` — 跟新仓 FileContent.ext 字段一致,
 * 避免上游 file-renderer / mergeforward FileCard 取字段时来回换名。
 *
 * **来源**:`messageId / fromUID / messageSeq` 等回复 / 高亮上下文字段对应旧
 * FilePreviewInfo,P4 暂不实现回复联动,字段保留供后续接入。
 */

import type { ComponentType } from "react";

export interface FilePreviewInfo {
  url: string;
  name: string;
  ext: string;
  size?: number;
  /** 消息 ID — 标记激活的卡片(高亮当前预览的那张 file 卡片);P4 暂未消费 */
  messageId?: string;
  /** 来源频道 ID — 旧仓用于判定是否子区面板内触发,新仓暂未消费 */
  sourceChannelId?: string;
  sourceChannelType?: number;
}

export type FileType =
  | "image"
  | "pdf"
  | "markdown"
  | "text"
  | "code"
  | "json"
  | "jsonl"
  | "excel"
  | "html"
  | "unknown";

export interface BaseRendererProps {
  file: FilePreviewInfo;
  /** 渲染器内部异常上抛(目前 panel 仅 console.error,后续可接 toast)。 */
  onError?: (msg: string) => void;
}

export type FileRenderer = ComponentType<BaseRendererProps>;

export interface RendererRegistryItem {
  type: FileType;
  extensions: string[];
  renderer: FileRenderer;
  /** 是否需要预加载文件文本(text/markdown/code/json/...);image/pdf/html 由浏览器自行加载。 */
  needsFetch: boolean;
}

/** 从 ext 字段或 filename 后缀提取小写扩展名(对齐旧 getExtension)。 */
export function getExtension(ext: string | undefined, name?: string): string {
  const e = (ext || "").toLowerCase();
  if (e) return e;
  if (name) {
    const dot = name.lastIndexOf(".");
    if (dot >= 0) return name.substring(dot + 1).toLowerCase();
  }
  return "";
}
