import { triggerDownload } from "@/features/chat/lib/file-download";

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
  try {
    const url = new URL(rawUrl, window.location.origin);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.href;
  } catch {
    return null;
  }
}

/**
 * 下载文件。
 * 复用聊天文件下载逻辑，跨域时走后端预签名 URL fallback。
 */
export async function downloadFile(url: string, fileName: string): Promise<void> {
  await triggerDownload(url, fileName);
}
