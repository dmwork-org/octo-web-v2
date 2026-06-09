import type { Channel } from "wukongimjssdk";
import { getUploadCredentials } from "@/features/base/api/endpoints/upload.api";

/**
 * 完整上传一张媒体文件:GET credentials → PUT 文件 → 返回 downloadUrl。
 *
 * **Why**:SDK `MediaMessageUploadTask` 内部上传时机是"消息 send 之后",而
 * RichText=14 聚合发送(b5a3b68e)需要"send 之前"先拿到所有图片 url 才能构造单个
 * type=14 payload。本 helper 暴露同样的 credentials + PUT 流程,供聚合路径调用。
 *
 * **不复用 upload-task 的原因**:upload-task 跟 SDK Message 生命周期耦合(写 message.content.url
 * 等),独立的 RichText 聚合路径没有 Message 实例。
 *
 * 失败时抛 Error,调用方应跳过该图片(对齐上游 isSafeUrl + Toast skip 模式)。
 */
export async function uploadChatMedia(
  file: File,
  channel: Channel,
  extension: string,
): Promise<string> {
  if (!file.size || file.size <= 0) {
    throw new Error("文件为空");
  }
  const contentType = file.type || "application/octet-stream";
  const filename = file.name || "file";
  const ext = extension ? `.${extension}` : "";
  const path = `/${channel.channelType}/${channel.channelID}/${genUploadId()}${ext}`;

  const credentials = await getUploadCredentials(
    { path, type: "chat", filename, contentType, fileSize: file.size },
    { silent: true },
  );
  if (!credentials.uploadUrl || !credentials.downloadUrl) {
    throw new Error("响应缺少凭证字段");
  }

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", credentials.uploadUrl, true);
    xhr.setRequestHeader("Content-Type", credentials.contentType);
    if (credentials.contentDisposition) {
      xhr.setRequestHeader("Content-Disposition", credentials.contentDisposition);
    }
    const fileSizeMB = file.size / (1024 * 1024);
    xhr.timeout = Math.max(2 * 60 * 1000, fileSizeMB * 10 * 1000);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`上传失败 (HTTP ${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("上传网络错误"));
    xhr.ontimeout = () => reject(new Error("上传超时"));
    xhr.send(file);
  });

  return credentials.downloadUrl;
}

/** URL allowlist:仅 http / https,过滤 javascript: / data: 等不安全 scheme。 */
export function isSafeUrl(url: string): boolean {
  try {
    const u = new URL(url, window.location.href);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function genUploadId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
