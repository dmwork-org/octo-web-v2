// Composer 附件相关纯函数(给 attachment-node + composer 用)。
// 抽出文件以满足 react-refresh/only-export-components 对 .tsx 的限制。

export interface AttachmentAttributes {
  id: string;
  name: string;
  size: number;
  type: string;
  /** 图片/视频预览的 object URL(图片直接用,视频用第一帧封面) */
  previewUrl?: string;
  /** paste = 粘贴进编辑器作为 inline node;upload = 通过上传按钮,放顶部附件区 */
  source?: "paste" | "upload";
}

/** 顶部附件区(upload 路径)条目,带原始 File 供发送时使用。 */
export interface TopAttachmentItem {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  previewUrl?: string;
}

export function isImageMime(type: string, name: string): boolean {
  if (type.startsWith("image/")) return true;
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.substring(dot + 1).toLowerCase() : "";
  return ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"].includes(ext);
}

export function isVideoMime(type: string, name: string): boolean {
  if (type.startsWith("video/")) return true;
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.substring(dot + 1).toLowerCase() : "";
  return ["mp4", "avi", "mov", "mkv", "webm"].includes(ext);
}

export function extOfName(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.substring(dot + 1).toLowerCase() : "";
}

/**
 * 给视频文件抓第一帧画面 → dataURL(jpg)。失败返回 undefined。
 * 对齐旧 dmworkbase MessageInput generateVideoCover。
 */
export function generateVideoCover(file: File): Promise<string | undefined> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    const url = URL.createObjectURL(file);
    video.src = url;
    video.onloadeddata = () => {
      video.currentTime = 0;
    };
    video.onseeked = () => {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const coverUrl = canvas.toDataURL("image/jpeg", 0.8);
        URL.revokeObjectURL(url);
        resolve(coverUrl);
      } else {
        URL.revokeObjectURL(url);
        resolve(undefined);
      }
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(undefined);
    };
  });
}

export function makeAttachmentId(file: File): string {
  return `${file.name}-${file.size}-${file.lastModified}-${Date.now()}`;
}
