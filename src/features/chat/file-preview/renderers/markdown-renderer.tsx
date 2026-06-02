import { useEffect, useRef } from "react";
import { Markdown } from "@/components/ui/markdown";
import { getRenderMode, shouldFetchContent } from "@/features/chat/file-preview/config";
import { useFileContent } from "@/features/chat/file-preview/hooks/use-file-content";
import {
  FileTooLarge,
  RendererError,
  RendererLoading,
} from "@/features/chat/file-preview/renderer-state";
import { CommonCodeView } from "@/features/chat/file-preview/renderers/common-code-view";
import type { BaseRendererProps, TocItem } from "@/features/chat/file-preview/types";

/**
 * Markdown 文件 renderer(对齐旧 MarkdownRenderer):
 *   - **预览模式**(默认):复用项目通用 `<Markdown>` 组件
 *   - **源码模式**(viewMode='source'):走 CommonCodeView language='markdown' 高亮
 *   - TOC:渲染后 DOM 扫 h1/h2/h3,注入 id + 上报 items 给 panel
 *     (不实现 scroll spy,只支持 click 跳转)
 *   - 超大文件(>20MB)走 FileTooLarge 兜底
 *
 * **简化**(不实现):512KB 阈值自动切源码模式 — 由用户手动 toggle。
 */
export function MarkdownRenderer({
  file,
  onError,
  viewMode = "preview",
  onTocChange,
}: BaseRendererProps) {
  const enabled = shouldFetchContent(file.size || 0);
  const { content, loading, error, reload } = useFileContent({ url: file.url, enabled });
  const previewRef = useRef<HTMLDivElement>(null);

  useExtractTocFromMarkdown({
    rootRef: previewRef,
    content: viewMode === "preview" ? content : null,
    viewMode,
    onTocChange,
  });

  if (!enabled) {
    if (onError) onError("文件过大,无法预览");
    return <FileTooLarge name={file.name} size={file.size} url={file.url} />;
  }
  if (loading) return <RendererLoading />;
  if (error) return <RendererError message={error} onRetry={reload} />;
  if (!content) return <RendererLoading />;

  if (viewMode === "source") {
    const renderMode = getRenderMode(new Blob([content]).size);
    return (
      <CommonCodeView
        file={file}
        renderMode={renderMode}
        formattedContent={content}
        language="markdown"
        loading={false}
        error={null}
        onReload={reload}
        fileSize={file.size || 0}
        contentSize={new Blob([content]).size}
      />
    );
  }

  return (
    <div ref={previewRef} className="h-full overflow-auto bg-bg-base px-5 py-4">
      <Markdown content={content} />
    </div>
  );
}

/**
 * 渲染完成后 DOM 扫 h1/h2/h3 节点,注入 id + 上报 toc items 给 panel。
 * 抽到命名 hook 满足 `no-useeffect-in-component`(component 本体禁止裸 useEffect)。
 *
 * **稳定性**:
 *   - onTocChange 由 panel 用 useCallback 包稳定引用
 *   - source 模式 / 加载中传 content=null → 清空 items(避免上次预览的残留)
 */
function useExtractTocFromMarkdown({
  rootRef,
  content,
  viewMode,
  onTocChange,
}: {
  rootRef: React.RefObject<HTMLDivElement | null>;
  content: string | null;
  viewMode: "preview" | "source";
  onTocChange?: (items: TocItem[]) => void;
}): void {
  useEffect(() => {
    if (viewMode !== "preview") {
      onTocChange?.([]);
      return;
    }
    if (!content || !rootRef.current) {
      onTocChange?.([]);
      return;
    }
    const headings = Array.from(rootRef.current.querySelectorAll("h1, h2, h3")) as HTMLElement[];
    const items: TocItem[] = headings.map((h, i) => {
      const lvl = Number.parseInt(h.tagName.charAt(1), 10) as 1 | 2 | 3;
      const text = (h.textContent ?? "").trim();
      const id = `md-h-${i}-${slug(text)}`;
      h.id = id;
      return { level: lvl, text, id };
    });
    onTocChange?.(items);
  }, [content, viewMode, rootRef, onTocChange]);
}

/** 简版 slug:小写 + 中文/英数保留,其他 → `-`。用作 heading id 后缀。 */
function slug(text: string): string {
  // eslint-disable-next-line no-misleading-character-class
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w一-龥]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
