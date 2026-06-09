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
  /** 消息 ID — reply 时优先查 message cache,找不到走 fakeMessage 路径 */
  messageId?: string;
  /** 消息 seq — reply 构造 Reply 用 */
  messageSeq?: number;
  /** 发送者 UID — reply 时:非自己消息会自动 @mention 发送者 */
  fromUID?: string;
  /** 消息摘要 — reply 走 fakeMessage 路径时作 MessageText 内容(quoted bar 显示) */
  conversationDigest?: string;
  /** 来源频道 — 旧仓用于判定是否子区面板内触发,新仓暂未消费 */
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
  /**
   * 视图模式 — panel 持有,renderer 按需消费(仅 Markdown 真切换;
   * Code/Html 简化版忽略此字段)。
   *   - "preview"(默认):渲染视图
   *   - "source":源码视图(markdown 走 highlight-markdown,html 走 code 风格)
   */
  viewMode?: "preview" | "source";
  /**
   * Markdown 上报 toc 大纲(h1/h2/h3),panel 根据此判定是否显示 TOC 按钮 + 渲染
   * popup 列表。其他 renderer 不调用。
   *
   * **id 约定**:slug(由 renderer 内 anchor 注入到 DOM `<h_>` 上),click toc
   * item 时 panel 用 `document.getElementById(id).scrollIntoView()` 跳转。
   */
  onTocChange?: (items: TocItem[]) => void;
}

export interface TocItem {
  level: 1 | 2 | 3;
  text: string;
  id: string;
}

export type FileRenderer = ComponentType<BaseRendererProps>;

export interface RendererRegistryItem {
  type: FileType;
  extensions: string[];
  renderer: FileRenderer;
  /** 是否需要预加载文件文本(text/markdown/code/json/...);image/pdf/html 由浏览器自行加载。 */
  needsFetch: boolean;
}

/**
 * 从 filename 后缀或 ext 字段提取小写扩展名(1:1 对齐上游 4b2e89c0 / #143)。
 *
 * **优先级**:filename 后缀 > content.ext。原因:服务端 content.extension 不可靠
 * (实测 .md 文件该字段为空或返 "file" 占位),让"暂不支持预览"错误命中。
 * 文件名后缀(.md)是真值源,优先用。content.ext 仅作 fallback(filename 无后缀
 * 如 Makefile / Dockerfile)。
 */
export function getExtension(ext: string | undefined, name?: string): string {
  if (name) {
    const dot = name.lastIndexOf(".");
    if (dot >= 0) {
      const suffix = name.substring(dot + 1).toLowerCase();
      if (suffix) return suffix;
    }
  }
  return (ext || "").toLowerCase();
}
