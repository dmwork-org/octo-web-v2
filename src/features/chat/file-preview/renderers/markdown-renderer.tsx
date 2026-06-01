import { useMemo } from "react";
import { Markdown } from "@/components/ui/markdown";
import { shouldFetchContent } from "@/features/chat/file-preview/config";
import { useFileContent } from "@/features/chat/file-preview/hooks/use-file-content";
import {
  FileTooLarge,
  RendererError,
  RendererLoading,
} from "@/features/chat/file-preview/renderer-state";
import type { BaseRendererProps } from "@/features/chat/file-preview/types";

/**
 * Markdown 文件 renderer(对齐旧 MarkdownRenderer 简化版):
 *   - 复用项目通用 `<Markdown>` 组件(react-markdown + remark-gfm + remark-breaks)
 *   - 拉取文本 → Markdown 渲染
 *   - **简化**(不复刻旧 MarkdownRenderer 加的 TOC / 源码切换 / 200KB 阈值自动切源码模式):
 *     长文档导航体验后续按需补
 *   - 超大文件(>20MB)走 FileTooLarge 兜底
 *
 * `<Markdown>` 已含 mention/emoji token 体系(本 renderer 不传 tokens,纯 markdown 渲染)。
 */
export function MarkdownRenderer({ file, onError }: BaseRendererProps) {
  const enabled = shouldFetchContent(file.size || 0);
  const { content, loading, error, reload } = useFileContent({ url: file.url, enabled });

  // size 未知或超过 20MB 直接走 FileTooLarge(对齐 enabled=false 的 case)
  const oversize = useMemo(() => !enabled, [enabled]);
  if (oversize) {
    if (onError) onError("文件过大,无法预览");
    return <FileTooLarge name={file.name} size={file.size} url={file.url} />;
  }

  if (loading) return <RendererLoading />;
  if (error) return <RendererError message={error} onRetry={reload} />;
  if (!content) return <RendererLoading />;

  return (
    <div className="h-full overflow-auto bg-bg-base px-5 py-4">
      <Markdown content={content} />
    </div>
  );
}
