import { useMemo } from "react";
import {
  type RenderMode,
  getRenderMode,
  shouldFetchContent,
} from "@/features/chat/file-preview/config";
import {
  type UseFileContentResult,
  useFileContent,
} from "@/features/chat/file-preview/hooks/use-file-content";
import type { FilePreviewInfo } from "@/features/chat/file-preview/types";

/**
 * 代码 / 文本类 renderer 通用 hook(1:1 对齐旧 useCodeRenderer):
 *   整合 use-file-content + 分级模式判定 + 可选 formatter(json prettify)。
 *
 * `text` / `code` / `json` renderer 三者共用 ─ 区别仅在 enableHighlight + formatter。
 */

export interface UseCodeRendererOptions {
  /** 内容预处理(如 JSON.stringify 美化)。 */
  formatter?: (raw: string) => string;
}

export interface UseCodeRendererResult extends UseFileContentResult {
  fileSize: number;
  contentSize: number;
  renderMode: RenderMode;
  formattedContent: string;
}

export function useCodeRenderer(
  file: FilePreviewInfo,
  options: UseCodeRendererOptions = {},
): UseCodeRendererResult {
  const { formatter } = options;
  const fileSize = file.size || 0;

  const { content, loading, error, reload } = useFileContent({
    url: file.url,
    enabled: shouldFetchContent(fileSize),
  });

  const contentSize = useMemo(() => {
    return content ? new Blob([content]).size : fileSize;
  }, [content, fileSize]);

  const renderMode = useMemo(() => getRenderMode(contentSize), [contentSize]);

  const formattedContent = useMemo(() => {
    if (!content) return "";
    if (formatter) return formatter(content);
    return content.replace(/\n$/, "");
  }, [content, formatter]);

  return {
    content,
    contentSize,
    fileSize,
    loading,
    error,
    reload,
    renderMode,
    formattedContent,
  };
}
