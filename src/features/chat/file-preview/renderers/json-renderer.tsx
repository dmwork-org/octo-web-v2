import { useCodeRenderer } from "@/features/chat/file-preview/hooks/use-code-renderer";
import { safeJsonParse } from "@/features/chat/file-preview/json-utils";
import { CommonCodeView } from "@/features/chat/file-preview/renderers/common-code-view";
import type { BaseRendererProps } from "@/features/chat/file-preview/types";

/**
 * JSON renderer(对齐旧 JsonRenderer):
 *   走 useCodeRenderer + formatter = `JSON.parse → stringify(_, 2)` 美化,
 *   走 CommonCodeView highlight(language=json)。
 *   非法 JSON 时 formatter 返回原文,SyntaxHighlighter 会以 json 风格尽力高亮。
 */
export function JsonRenderer({ file }: BaseRendererProps) {
  const { loading, error, reload, renderMode, formattedContent, fileSize, contentSize } =
    useCodeRenderer(file, {
      formatter: (raw) => {
        const parsed = safeJsonParse<unknown>(raw, null);
        return parsed === null ? raw : JSON.stringify(parsed, null, 2);
      },
    });
  return (
    <CommonCodeView
      file={file}
      renderMode={renderMode}
      formattedContent={formattedContent}
      language="json"
      loading={loading}
      error={error}
      onReload={reload}
      fileSize={fileSize}
      contentSize={contentSize}
    />
  );
}
