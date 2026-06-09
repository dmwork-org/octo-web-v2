import { $fetch } from "ofetch";

/**
 * 下载文件工具函数。
 * 对齐原始项目 downloadFile 的行为。
 */

/**
 * 解析并校验文件 URL。
 * 把后端可能给的相对路径拼上 baseURL 变成绝对 URL。
 */
export function resolveFileUrl(rawUrl: string | undefined): string | null {
  if (!rawUrl) return null;

  // 已经是绝对 URL
  if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
    return rawUrl;
  }

  // 相对路径，拼上 origin
  const origin = window.location.origin;
  const path = rawUrl.replace(/^\//, "");
  return `${origin}/${path}`;
}

/**
 * 下载文件。
 * 使用 ofetch + blob + createObjectURL 实现。
 */
export async function downloadFile(url: string, fileName: string): Promise<void> {
  const blob = await $fetch(url, { responseType: "blob" });

  const blobUrl = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = fileName;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();

  // 清理
  setTimeout(() => {
    URL.revokeObjectURL(blobUrl);
    document.body.removeChild(link);
  }, 100);
}
