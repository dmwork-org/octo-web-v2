import { useCodeRenderer } from "@/features/chat/file-preview/hooks/use-code-renderer";
import { getLanguageFromExtension } from "@/features/chat/file-preview/config";
import { CommonCodeView } from "@/features/chat/file-preview/renderers/common-code-view";
import type { BaseRendererProps } from "@/features/chat/file-preview/types";

/**
 * 代码 renderer(对齐旧 CodeRenderer):
 *   - 支持 25 个扩展(详见 registry.ts code 注册项)
 *   - <200KB 走 SyntaxHighlighter 高亮 / <2MB 走纯文本降级 / >20MB 拒绝预览
 *   - language 由 ext map(ts→typescript / py→python / yml→yaml / ...)
 */
export function CodeRenderer({ file }: BaseRendererProps) {
  const language = getLanguageFromExtension(file.ext);
  const { loading, error, reload, renderMode, formattedContent, fileSize, contentSize } =
    useCodeRenderer(file);
  return (
    <CommonCodeView
      file={file}
      renderMode={renderMode}
      formattedContent={formattedContent}
      language={language}
      loading={loading}
      error={error}
      onReload={reload}
      fileSize={fileSize}
      contentSize={contentSize}
    />
  );
}
