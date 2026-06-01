import { useCodeRenderer } from "@/features/chat/file-preview/hooks/use-code-renderer";
import { CommonCodeView } from "@/features/chat/file-preview/renderers/common-code-view";
import type { BaseRendererProps } from "@/features/chat/file-preview/types";

/**
 * 纯文本 renderer(对齐旧 TextRenderer):
 *   - txt / log / ini / conf / cfg
 *   - **forcePlain=true** — 不走 SyntaxHighlighter,即使 <200KB 也直出 <pre>
 *   - 大小分级仍生效:>20MB 拒绝预览
 */
export function TextRenderer({ file }: BaseRendererProps) {
  const { loading, error, reload, renderMode, formattedContent, fileSize, contentSize } =
    useCodeRenderer(file);
  return (
    <CommonCodeView
      file={file}
      renderMode={renderMode}
      formattedContent={formattedContent}
      language="text"
      loading={loading}
      error={error}
      onReload={reload}
      fileSize={fileSize}
      contentSize={contentSize}
      forcePlain
    />
  );
}
