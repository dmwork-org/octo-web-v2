import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, ShieldAlert } from "lucide-react";
import { useFileContent } from "@/features/chat/file-preview/hooks/use-file-content";
import { getRenderMode, shouldFetchContent } from "@/features/chat/file-preview/config";
import {
  FileTooLarge,
  RendererError,
  RendererLoading,
} from "@/features/chat/file-preview/renderer-state";
import { CommonCodeView } from "@/features/chat/file-preview/renderers/common-code-view";
import type { BaseRendererProps } from "@/features/chat/file-preview/types";
import { triggerDownload } from "@/features/chat/lib/file-download";
import { useT } from "@/lib/i18n/use-t";

/**
 * HTML renderer(1:1 对齐旧 dmworkbase HtmlRenderer):
 *   - **预览 / 源码切换**(panel header ViewToggle 已对 type=html 启用)
 *   - 预览模式:`iframe` + `srcdoc` 注入,`sandbox="allow-scripts"`(默认允许脚本,
 *     不给 same-origin,防止读 parent storage / cookie)
 *   - **CSP 监听**:在 srcdoc 头部注入脚本,`securitypolicyviolation` 命中
 *     script-src/connect-src 时 postMessage 上报,父页面降级为"安全模式"提示页
 *     (停止渲染 HTML)
 *   - **iframe 渲染失败自动切源码**(onError 兜底)
 *   - 源码模式:走 CommonCodeView language=html(<200KB 高亮 / <2MB 纯文本 / >2MB 兜底)
 *   - 大文件(>20MB)走 FileTooLarge 兜底
 */

/** 注入 CSP 监听脚本到 HTML <head> 最前(对齐老仓 injectCspMonitor)。
 *  iframe 内 CSP 违规事件不冒泡到父页面,必须 iframe 内监听后 postMessage。 */
function injectCspMonitor(html: string): string {
  // 注:用 <\/script> 防止字面 </script> 被解析成闭合标签
  const script =
    `<script data-wk="csp-monitor">(function(){` +
    `document.addEventListener('securitypolicyviolation',function(e){` +
    `var d=e.effectiveDirective||e.violatedDirective||'';` +
    `if(d.indexOf('script-src')!==-1||d.indexOf('connect-src')!==-1){` +
    `window.parent.postMessage({type:'html-csp-violation',directive:d},'*');` +
    `}` +
    `});` +
    `})();</script>`;

  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (m) => m + script);
  }
  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/<html[^>]*>/i, (m) => m + script);
  }
  return script + html;
}

export function HtmlRenderer({
  file,
  onError,
  viewMode = "preview",
  onViewModeChange,
}: BaseRendererProps) {
  const t = useT();
  const enabled = shouldFetchContent(file.size || 0);
  const { content, loading, error, reload } = useFileContent({ url: file.url, enabled });

  const [iframeLoading, setIframeLoading] = useState(true);
  const [renderError, setRenderError] = useState<string | null>(null);
  // CSP 命中后切到"安全模式"提示页(不再渲染 iframe)。
  // 注:不再用 scriptEnabled 状态,因为 cspFallback=true 时已提前 return,
  // 渲染 iframe 的分支永远走 allow-scripts。
  const [cspFallback, setCspFallback] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useResetOnFileChange(file.url, setCspFallback, setRenderError);
  useResetIframeLoadingOnPreview(content, viewMode, setIframeLoading);

  const handleDownload = useCallback(
    () => void triggerDownload(file.url, file.name),
    [file.url, file.name],
  );

  // 监听 iframe 上报的 CSP 违规 / render error
  useListenIframeMessages({
    enabled: viewMode === "preview" && !!content,
    iframeRef,
    onCspViolation: (directive) => {
      console.warn("[HtmlRenderer] CSP violation inside iframe, disable HTML preview.", directive);
      setCspFallback(true);
      setIframeLoading(false);
    },
    onRenderError: (msg) => {
      const errorMsg = t("filePreview.html.renderError", {
        values: { message: msg || t("filePreview.html.unknownError") },
      });
      setRenderError(errorMsg);
      onError?.(errorMsg);
    },
  });

  const srcdocContent = useMemo(() => (content ? injectCspMonitor(content) : ""), [content]);

  const contentSize = useMemo(
    () => (file.size ? file.size : content ? new Blob([content]).size : 0),
    [file.size, content],
  );
  const sourceRenderMode = useMemo(
    () => getRenderMode(contentSize, "html"),
    [contentSize],
  );

  // ─── 提前返回 ───────────────────────────────────────────
  if (!enabled) return <FileTooLarge name={file.name} size={file.size} url={file.url} />;
  if (loading) return <RendererLoading />;
  if (error) return <RendererError message={error} onRetry={reload} />;
  if (!content) return <RendererLoading />;

  // ─── 源码模式 ───────────────────────────────────────────
  if (viewMode === "source") {
    if (sourceRenderMode === "too-large") {
      return <FileTooLarge name={file.name} size={contentSize} url={file.url} />;
    }
    return (
      <CommonCodeView
        file={file}
        renderMode={sourceRenderMode}
        formattedContent={content}
        language="html"
        loading={false}
        error={null}
        onReload={reload}
        fileSize={file.size || 0}
        contentSize={contentSize}
      />
    );
  }

  // ─── CSP 命中:安全模式提示页 ───────────────────────────
  if (cspFallback) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
        <ShieldAlert size={48} strokeWidth={1.5} className="text-text-tertiary" />
        <div className="flex flex-col items-center gap-1.5">
          <h3 className="text-base font-semibold text-text-primary">
            {t("filePreview.html.safePreviewBlockedTitle")}
          </h3>
          <p className="max-w-md text-sm text-text-secondary">
            {t("filePreview.html.safePreviewBlockedMessage")}
          </p>
          <p className="max-w-md text-xs text-text-tertiary">
            {t("filePreview.html.safePreviewBlockedSubmessage")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onViewModeChange ? (
            <button
              type="button"
              onClick={() => onViewModeChange("source")}
              className="inline-flex h-7 cursor-pointer items-center rounded-md border border-border-default bg-bg-surface px-3 text-xs text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
            >
              {t("filePreview.html.viewSource")}
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md bg-brand px-3 text-xs text-text-inverse transition-opacity hover:opacity-90"
          >
            <Download size={14} />
            <span>{t("filePreview.downloadFile")}</span>
          </button>
        </div>
      </div>
    );
  }

  // ─── 预览模式 ───────────────────────────────────────────
  return (
    <div className="relative h-full w-full">
      {iframeLoading ? (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-bg-base text-sm text-text-tertiary">
          <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-border-default border-t-brand" />
          <span>{t("filePreview.html.rendering")}</span>
        </div>
      ) : null}
      <iframe
        ref={iframeRef}
        title={file.name}
        srcDoc={srcdocContent}
        // 安全策略:allow-scripts 允许 HTML 内嵌 JS 跑;不给 allow-same-origin
        // (防 iframe 读 parent storage / cookie)。命中 CSP 时由 cspFallback
        // 切到"安全模式"提示页(分支提前 return),不再走到这里。
        sandbox="allow-scripts"
        onLoad={() => setIframeLoading(false)}
        onError={() => {
          setIframeLoading(false);
          const errorMsg = t("filePreview.html.renderFailedSwitchSource");
          setRenderError(errorMsg);
          onError?.(errorMsg);
        }}
        className={`h-full w-full border-0 bg-bg-base ${iframeLoading ? "invisible" : "visible"}`}
      />
      {renderError ? (
        <div className="absolute right-2 bottom-2 left-2 z-20 flex items-center gap-2 rounded-md border border-error/20 bg-error/5 px-3 py-1.5 text-xs text-error">
          <span>⚠ {renderError}</span>
        </div>
      ) : null}
    </div>
  );
}

/** 文件 url 变化时重置 CSP fallback 与 render error(对齐老仓 file-url 重置)。 */
function useResetOnFileChange(
  url: string,
  setCspFallback: (v: boolean) => void,
  setRenderError: (v: string | null) => void,
): void {
  useEffect(() => {
    setCspFallback(false);
    setRenderError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);
}

/** 切回预览模式时重置 iframe loading 状态。 */
function useResetIframeLoadingOnPreview(
  content: string | null,
  viewMode: "preview" | "source",
  setIframeLoading: (v: boolean) => void,
): void {
  useEffect(() => {
    if (content && viewMode === "preview") setIframeLoading(true);
  }, [content, viewMode, setIframeLoading]);
}

/** 监听 iframe 通过 postMessage 上报的 CSP 违规 / render error。
 *  多实例安全:event.source === iframe.contentWindow 保证只响应自己的 iframe。 */
function useListenIframeMessages({
  enabled,
  iframeRef,
  onCspViolation,
  onRenderError,
}: {
  enabled: boolean;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  onCspViolation: (directive: string) => void;
  onRenderError: (message: string) => void;
}): void {
  useEffect(() => {
    if (!enabled) return;
    const handler = (event: MessageEvent) => {
      const iframe = iframeRef.current;
      if (!iframe || event.source !== iframe.contentWindow) return;
      const data = event.data as { type?: string; directive?: string; message?: string };
      if (data?.type === "html-csp-violation") {
        onCspViolation(data.directive ?? "");
      } else if (data?.type === "html-render-error") {
        onRenderError(data.message ?? "");
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [enabled, iframeRef, onCspViolation, onRenderError]);
}
