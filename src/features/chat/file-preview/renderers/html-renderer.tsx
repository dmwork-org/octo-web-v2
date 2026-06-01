import { useFileContent } from "@/features/chat/file-preview/hooks/use-file-content";
import { shouldFetchContent } from "@/features/chat/file-preview/config";
import {
  FileTooLarge,
  RendererError,
  RendererLoading,
} from "@/features/chat/file-preview/renderer-state";
import type { BaseRendererProps } from "@/features/chat/file-preview/types";

/**
 * HTML renderer(对齐旧 HtmlRenderer 简化版):
 *   - **简化**(不复刻旧预览/源码切换 + CSP 监听 postMessage 上报):
 *     默认预览模式;源码查看用户可走 code-renderer(改名后缀)
 *   - sandbox 策略:`allow-popups allow-popups-to-escape-sandbox` —
 *     **不给 allow-same-origin**(防 iframe 读 parent storage/cookie),
 *     **不给 allow-scripts**(防止 XSS)。若 HTML 依赖 JS 体验劣化但安全
 *   - 拉文本走 useFileContent,blob URL 喂给 iframe,避免直接 src(可能受
 *     上游 X-Frame-Options / CSP frame-ancestors 拦截)
 */
export function HtmlRenderer({ file }: BaseRendererProps) {
  const enabled = shouldFetchContent(file.size || 0);
  const { content, loading, error, reload } = useFileContent({ url: file.url, enabled });

  if (!enabled) return <FileTooLarge name={file.name} size={file.size} url={file.url} />;
  if (loading) return <RendererLoading />;
  if (error) return <RendererError message={error} onRetry={reload} />;
  if (!content) return <RendererLoading />;

  const blobUrl = URL.createObjectURL(new Blob([content], { type: "text/html;charset=utf-8" }));

  return (
    <iframe
      title={file.name}
      src={blobUrl}
      sandbox="allow-popups allow-popups-to-escape-sandbox"
      className="h-full w-full border-0 bg-bg-base"
      onLoad={() => {
        // blob URL 在 iframe 加载后即可释放(浏览器已持有引用)
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      }}
    />
  );
}
