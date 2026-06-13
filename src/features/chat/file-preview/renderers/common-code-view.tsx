import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import bash from "react-syntax-highlighter/dist/esm/languages/prism/bash";
import css from "react-syntax-highlighter/dist/esm/languages/prism/css";
import go from "react-syntax-highlighter/dist/esm/languages/prism/go";
import javascript from "react-syntax-highlighter/dist/esm/languages/prism/javascript";
import json from "react-syntax-highlighter/dist/esm/languages/prism/json";
import markdown from "react-syntax-highlighter/dist/esm/languages/prism/markdown";
import python from "react-syntax-highlighter/dist/esm/languages/prism/python";
import sql from "react-syntax-highlighter/dist/esm/languages/prism/sql";
import typescript from "react-syntax-highlighter/dist/esm/languages/prism/typescript";
import yaml from "react-syntax-highlighter/dist/esm/languages/prism/yaml";
import xml from "react-syntax-highlighter/dist/esm/languages/prism/markup";
import { Download } from "lucide-react";
import { triggerDownload } from "@/features/chat/lib/file-download";
import {
  RendererEmpty,
  RendererError,
  RendererLoading,
} from "@/features/chat/file-preview/renderer-state";
import { formatFileSize, type RenderMode } from "@/features/chat/file-preview/config";
import type { FilePreviewInfo } from "@/features/chat/file-preview/types";
import { useT } from "@/lib/i18n/use-t";

// Prism light:按需注册高频语言(对应旧 LANGUAGE_MAP + registry code 扩展名列表)。
// 未注册的语言 SyntaxHighlighter 会 fallback 到纯文本展示,不报错。
SyntaxHighlighter.registerLanguage("bash", bash);
SyntaxHighlighter.registerLanguage("css", css);
SyntaxHighlighter.registerLanguage("go", go);
SyntaxHighlighter.registerLanguage("javascript", javascript);
SyntaxHighlighter.registerLanguage("json", json);
SyntaxHighlighter.registerLanguage("markdown", markdown);
SyntaxHighlighter.registerLanguage("python", python);
SyntaxHighlighter.registerLanguage("sql", sql);
SyntaxHighlighter.registerLanguage("typescript", typescript);
SyntaxHighlighter.registerLanguage("yaml", yaml);
SyntaxHighlighter.registerLanguage("xml", xml);

interface CommonCodeViewProps {
  file: FilePreviewInfo;
  renderMode: RenderMode;
  formattedContent: string;
  /** 'text' 表示走 pre 不高亮(用于 TextRenderer);其他给 SyntaxHighlighter language。 */
  language: string;
  loading: boolean;
  error: string | null;
  onReload: () => void;
  fileSize: number;
  contentSize: number;
  /** 是否强制纯文本(TextRenderer 走此分支不进高亮)。 */
  forcePlain?: boolean;
  /** 隐藏 plain 模式自带的"已禁用语法高亮"提示(调用方已有自己的大文件提示,避免重复)。 */
  hidePlainHint?: boolean;
}

/**
 * 通用代码 / 文本视图(1:1 对齐旧 CodeRendererBase):
 *   - too-large:提示文件过大 + 下载按钮
 *   - loading:RendererLoading
 *   - error:RendererError + 重试
 *   - 空内容:RendererEmpty
 *   - highlight:SyntaxHighlighter PrismLight + oneLight 主题 + 行号
 *   - plain:<pre> 简版(也用于 forcePlain TextRenderer)
 */
export function CommonCodeView({
  file,
  renderMode,
  formattedContent,
  language,
  loading,
  error,
  onReload,
  fileSize,
  contentSize,
  forcePlain,
  hidePlainHint,
}: CommonCodeViewProps) {
  const t = useT();
  if (renderMode === "too-large") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="text-sm font-medium text-text-primary">
          {t("filePreview.largeFileMessage", { values: { size: formatFileSize(fileSize) } })}
        </div>
        <button
          type="button"
          onClick={() => void triggerDownload(file.url, file.name)}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border-default px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
        >
          <Download size={14} />
          <span>{t("filePreview.download")}</span>
        </button>
      </div>
    );
  }

  if (loading) return <RendererLoading />;
  if (error) return <RendererError message={error} onRetry={onReload} />;
  if (!formattedContent) return <RendererEmpty />;

  const useHighlight = !forcePlain && renderMode === "highlight";

  if (useHighlight) {
    return (
      <div className="h-full overflow-auto bg-bg-base">
        <SyntaxHighlighter
          language={language}
          style={oneLight}
          showLineNumbers
          customStyle={{
            margin: 0,
            padding: "12px 16px",
            fontSize: 12.5,
            lineHeight: 1.6,
            background: "transparent",
          }}
          codeTagProps={{
            style: { fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, monospace" },
          }}
        >
          {formattedContent}
        </SyntaxHighlighter>
      </div>
    );
  }

  // plain / forcePlain — 大文件降级或纯文本
  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg-base">
      {renderMode === "plain" && !forcePlain && !hidePlainHint ? (
        <div className="shrink-0 border-b border-border-subtle bg-bg-elevated px-3 py-1.5 text-[11px] text-text-tertiary">
          {t("filePreview.largeFilePlainHint", { values: { size: formatFileSize(contentSize) } })}
        </div>
      ) : null}
      <pre className="m-0 flex-1 overflow-auto px-4 py-3 font-mono text-[12.5px] leading-[1.6] break-words whitespace-pre-wrap text-text-primary">
        {formattedContent}
      </pre>
    </div>
  );
}
