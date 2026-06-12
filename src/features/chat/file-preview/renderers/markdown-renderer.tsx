import { useEffect, useRef } from "react";
import { Markdown } from "@/components/ui/markdown";
import {
  FILE_SIZE_THRESHOLD,
  getRenderMode,
  shouldFetchContent,
} from "@/features/chat/file-preview/config";
import { useFileContent } from "@/features/chat/file-preview/hooks/use-file-content";
import {
  FileTooLarge,
  RendererEmpty,
  RendererError,
  RendererLoading,
} from "@/features/chat/file-preview/renderer-state";
import { CommonCodeView } from "@/features/chat/file-preview/renderers/common-code-view";
import type { BaseRendererProps, TocItem } from "@/features/chat/file-preview/types";
import { useT } from "@/lib/i18n/use-t";

/**
 * Markdown 文件 renderer(对齐旧 MarkdownRenderer):
 *   - **预览模式**(默认):复用项目通用 `<Markdown>` 组件,enableMath 渲染数学公式
 *   - **源码模式**(viewMode='source'):走 CommonCodeView language='markdown' 高亮
 *   - **大文件**(>200KB,对齐老仓 MARKDOWN_PREVIEW 阈值):强制切源码模式 +
 *     顶部"已自动切换到源码模式"提示条
 *   - TOC:渲染后 DOM 扫 **h2/h3**,注入 id 上报 panel;panel 按 h2≥3 显示 TOC,
 *     scroll spy 用 IntersectionObserver 高亮当前章节
 *   - 空文件(content === ""):显示 RendererEmpty(避免空串当 falsy 一直转圈)
 *   - 超大文件(>20MB)走 FileTooLarge 兜底
 */
export function MarkdownRenderer({
  file,
  onError,
  viewMode = "preview",
  onTocChange,
}: BaseRendererProps) {
  const t = useT();
  const enabled = shouldFetchContent(file.size || 0);
  const { content, loading, error, reload } = useFileContent({ url: file.url, enabled });
  const previewRef = useRef<HTMLDivElement>(null);

  // 大文件(>200KB)强制源码模式(对齐老仓 MARKDOWN_PREVIEW 阈值 + largeAutoSource 提示)。
  const contentBytes = content ? new Blob([content]).size : (file.size ?? 0);
  const isLargeMarkdown = contentBytes > FILE_SIZE_THRESHOLD.MARKDOWN_PREVIEW;
  const effectiveViewMode: "preview" | "source" = isLargeMarkdown ? "source" : viewMode;

  useExtractTocFromMarkdown({
    rootRef: previewRef,
    content: effectiveViewMode === "preview" ? content : null,
    viewMode: effectiveViewMode,
    onTocChange,
  });

  if (!enabled) {
    if (onError) onError(t("filePreview.markdown.tooLargeCannotPreview"));
    return <FileTooLarge name={file.name} size={file.size} url={file.url} />;
  }
  if (loading) return <RendererLoading />;
  if (error) return <RendererError message={error} onRetry={reload} />;
  // content === null:尚未加载完成;content === "":加载成功但空文件 → 显示空态
  // (对齐老仓:空字符串不能当 falsy 一直转圈)
  if (content === null) return <RendererLoading />;
  if (content.trim() === "") return <RendererEmpty />;

  if (effectiveViewMode === "source") {
    const renderMode = getRenderMode(contentBytes);
    return (
      <div className="flex h-full flex-col">
        {isLargeMarkdown ? (
          <div className="shrink-0 bg-bg-elevated px-4 py-2 text-xs text-text-tertiary">
            {t("filePreview.markdown.largeAutoSource")}
          </div>
        ) : null}
        <div className="min-h-0 flex-1">
          <CommonCodeView
            file={file}
            renderMode={renderMode}
            formattedContent={content}
            language="markdown"
            loading={false}
            error={null}
            onReload={reload}
            fileSize={file.size || 0}
            contentSize={contentBytes}
            hidePlainHint={isLargeMarkdown}
          />
        </div>
      </div>
    );
  }

  return (
    <div ref={previewRef} className="h-full overflow-auto bg-bg-base px-5 py-4">
      <Markdown content={content} enableMath />
    </div>
  );
}

/**
 * 渲染完成后 DOM 扫 h2/h3 节点,注入 id + 上报 toc items 给 panel。
 * 抽到命名 hook 满足 `no-useeffect-in-component`(component 本体禁止裸 useEffect)。
 *
 * **对齐老仓**:只收 h2/h3(不含 h1),panel 侧再按 "h2 ≥ 3" 判定是否显示 TOC 按钮。
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
    const headings = Array.from(rootRef.current.querySelectorAll("h2, h3")) as HTMLElement[];
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
