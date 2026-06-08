import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n/instance";

/**
 * 文件内容加载 hook(1:1 对齐旧 Components/FilePreviewPanel/hooks/useFileContent.ts):
 *   - text(默认)/ arraybuffer 两种 responseType
 *   - AbortController 取消上一个请求,避免竞态
 *   - reload 手动重试
 *
 * 用于 needsFetch=true 的 renderer(markdown / code / text / json / jsonl /
 * excel / html)预加载文件文本;image / pdf / fallback 由浏览器自行加载,不用此 hook。
 *
 * **enabled=false 不发请求**,用于 shouldFetchContent 大文件守门。
 */

export type ResponseType = "text" | "arraybuffer";

export interface UseFileContentOptions<T extends ResponseType = "text"> {
  url: string;
  enabled?: boolean;
  responseType?: T;
}

export type ContentType<T extends ResponseType> = T extends "arraybuffer" ? ArrayBuffer : string;

export interface UseFileContentResult<T extends ResponseType = "text"> {
  content: ContentType<T> | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useFileContent<T extends ResponseType = "text">(
  options: UseFileContentOptions<T>,
): UseFileContentResult<T> {
  const { url, enabled = true, responseType = "text" as T } = options;

  const [content, setContent] = useState<ContentType<T> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (!url || !enabled) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    setError(null);

    try {
      const resp = await fetch(url, { signal: ctrl.signal });
      if (ctrl.signal.aborted) return;
      if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);

      const buffer = await resp.arrayBuffer();
      if (ctrl.signal.aborted) return;

      if (responseType === "arraybuffer") {
        setContent(buffer as ContentType<T>);
      } else {
        const text = new TextDecoder("utf-8").decode(buffer);
        setContent(text as ContentType<T>);
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : t("filePreview.loadFailed"));
      setContent(null);
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, [url, enabled, responseType]);

  useEffect(() => {
    void load();
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [load]);

  const reload = useCallback(() => {
    void load();
  }, [load]);

  return { content, loading, error, reload };
}
