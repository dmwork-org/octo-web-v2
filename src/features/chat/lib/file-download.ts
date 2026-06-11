import { api } from "@/features/base/api/client";

/**
 * 跨域文件下载 — 走后端预签名 URL(1:1 对齐旧 dmworkbase Utils/download.ts):
 *
 * `<a download>` 在 URL 跨域时浏览器**忽略** download 属性,改为新窗口打开
 * (除非源服务器返 `Content-Disposition: attachment`)。
 *
 * 解决:跨域时调后端 `file/download/url?path=&filename=` 拿一个带
 * `Content-Disposition: attachment; filename=...` 的临时预签名 URL,
 * 再 a[download].click() 即可真下载。
 *
 * 同域 URL 直接走 a[download],无需预签名。
 *
 * **复用**:file-renderer 卡片下载按钮 / mergeforward FileCard / FilePreviewPanel
 * header download 共用此函数,避免三处重复。
 */
export async function triggerDownload(url: string, filename: string): Promise<void> {
  if (!url) return;
  let parsed: URL;
  try {
    parsed = new URL(url, window.location.href);
  } catch {
    return;
  }
  let downloadUrl = parsed.href;
  const isCrossOrigin = parsed.origin !== window.location.origin;
  const supportsPresignedDownload = parsed.protocol === "http:" || parsed.protocol === "https:";
  if (isCrossOrigin && filename && supportsPresignedDownload) {
    try {
      const resp = await api<{ url?: string }>(
        `file/download/url?path=${encodeURIComponent(parsed.href)}&filename=${encodeURIComponent(filename)}`,
      );
      if (resp?.url) downloadUrl = resp.url;
    } catch {
      // 拿预签名失败,fallback 用 raw url(浏览器可能新窗口打开,但至少不彻底失败)
    }
  }
  const a = document.createElement("a");
  a.href = downloadUrl;
  a.download = filename;
  if (isCrossOrigin) {
    a.target = "_blank";
    a.rel = "noopener noreferrer";
  }
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * 新窗口打开文件 URL — FilePreviewPanel header "在新窗口打开" 按钮用。
 * 不走 download,纯 window.open;noopener noreferrer 避免新窗口 access window.opener。
 */
export function openInNewWindow(url: string): void {
  if (!url) return;
  window.open(url, "_blank", "noopener,noreferrer");
}
