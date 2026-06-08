import { useCallback, useState } from "react";
import {
  FileTooLarge,
  RendererError,
  RendererLoading,
} from "@/features/chat/file-preview/renderer-state";
import { isFileTooLarge } from "@/features/chat/file-preview/config";
import type { BaseRendererProps } from "@/features/chat/file-preview/types";
import { useT } from "@/lib/i18n/use-t";

/**
 * 图片 renderer(对齐旧 ImageRenderer):
 *   - object-contain 自适应容器(简化:不复刻旧 ResizeObserver + ratio 计算,
 *     contain 已能在多数 panel 尺寸下正确显示)
 *   - loading / error / FileTooLarge(>20MB)三态
 *   - error 提供重试按钮
 */
export function ImageRenderer({ file, onError }: BaseRendererProps) {
  const t = useT();
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const onLoad = useCallback(() => setLoading(false), []);
  const onLoadError = useCallback(() => {
    setLoading(false);
    setErrored(true);
    onError?.(t("filePreview.image.loadFailed"));
  }, [onError, t]);

  const onRetry = useCallback(() => {
    setLoading(true);
    setErrored(false);
    setRetryKey((k) => k + 1);
  }, []);

  if (isFileTooLarge(file.size)) {
    return <FileTooLarge name={file.name} size={file.size} url={file.url} />;
  }

  if (errored) {
    return <RendererError message={t("filePreview.image.loadFailed")} onRetry={onRetry} />;
  }

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-auto bg-bg-base p-4">
      {loading ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <RendererLoading />
        </div>
      ) : null}
      <img
        key={retryKey}
        src={file.url}
        alt={file.name}
        onLoad={onLoad}
        onError={onLoadError}
        className={`max-h-full max-w-full rounded object-contain transition-opacity duration-150 ${
          loading ? "opacity-0" : "opacity-100"
        }`}
        draggable={false}
      />
    </div>
  );
}
