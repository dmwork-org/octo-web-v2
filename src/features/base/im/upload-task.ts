import { MessageTask, TaskStatus, type MediaMessageContent } from "wukongimjssdk";
import {
  getUploadCredentials,
  type UploadCredentials,
} from "@/features/base/api/endpoints/upload.api";

/** Image content 子类有 `url` 字段,基类 MediaMessageContent 没有;type-only intersection 让 cast 通过。 */
type MediaContentWithUrl = MediaMessageContent & { url?: string };

/**
 * 媒体消息(图片/文件/视频/语音)上传任务 — SDK MessageTask 实现。
 * 对应旧项目 `packages/dmworkdatasource/src/task.ts::MediaMessageUploadTask`。
 *
 * 生命周期:
 * 1. IMProvider 注册 `messageUploadTaskCallback = (msg) => new MediaMessageUploadTask(msg)`
 * 2. SDK send(MediaMessageContent) → 创建 task → 调 start()
 * 3. start() 拿 COS 直传凭证 → PUT 上传文件(XHR 带 progress)
 * 4. 上传完成回写 mediaContent.url / remoteUrl → status=success → SDK 真正发 SendPacket
 * 5. 失败 → status=fail;cancel() 终止上传
 */
export class MediaMessageUploadTask extends MessageTask {
  private _progress = 0;
  private xhr: XMLHttpRequest | undefined;

  private getUUID(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }

  async start(): Promise<void> {
    const mediaContent = this.message.content as MediaContentWithUrl;
    if (mediaContent.file) {
      try {
        const fileName = this.getUUID();
        const ext = mediaContent.extension ? `.${mediaContent.extension}` : "";
        const path = `/${this.message.channel.channelType}/${this.message.channel.channelID}/${fileName}${ext}`;
        const credentials = await this.fetchCredentials(mediaContent.file, path);
        if (credentials) {
          await this.uploadFile(mediaContent.file, credentials);
        } else {
          this.status = TaskStatus.fail;
          this.update();
        }
      } catch {
        this.status = TaskStatus.fail;
        this.update();
      }
      return;
    }
    // 没有 file(已上传过或转发场景)— 直接走 remoteUrl
    if (mediaContent.remoteUrl && mediaContent.remoteUrl !== "") {
      this.status = TaskStatus.success;
    } else {
      this.status = TaskStatus.fail;
    }
    this.update();
  }

  private async fetchCredentials(file: File, path: string): Promise<UploadCredentials | undefined> {
    const contentType = file.type || "application/octet-stream";
    const filename = file.name || "file";
    try {
      const result = await getUploadCredentials({
        path,
        type: "chat",
        filename,
        contentType,
        fileSize: file.size,
      });
      if (result.uploadUrl && result.downloadUrl) return result;
    } catch {
      return undefined;
    }
    return undefined;
  }

  private uploadFile(file: File, credentials: UploadCredentials): Promise<void> {
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      this.xhr = xhr;
      xhr.open("PUT", credentials.uploadUrl, true);
      xhr.setRequestHeader("Content-Type", credentials.contentType);
      if (credentials.contentDisposition) {
        xhr.setRequestHeader("Content-Disposition", credentials.contentDisposition);
      }
      // 动态超时:每 MB 预留 10s,最低 2 min 兜底
      const fileSizeMB = file.size / (1024 * 1024);
      xhr.timeout = Math.max(2 * 60 * 1000, fileSizeMB * 10 * 1000);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && e.total > 0) {
          this._progress = Math.round((e.loaded / e.total) * 100);
          this.update();
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const mediaContent = this.message.content as MediaContentWithUrl;
          mediaContent.url = credentials.downloadUrl;
          mediaContent.remoteUrl = credentials.downloadUrl;
          this.status = TaskStatus.success;
        } else {
          this.status = TaskStatus.fail;
        }
        this.update();
        resolve();
      };
      xhr.onerror = () => {
        if (this.status !== TaskStatus.cancel) {
          this.status = TaskStatus.fail;
          this.update();
        }
        resolve();
      };
      xhr.ontimeout = () => {
        this.status = TaskStatus.fail;
        this.update();
        resolve();
      };
      xhr.send(file);
    });
  }

  suspend(): void {
    // P3:暂停上传
  }

  resume(): void {
    // P3:恢复上传
  }

  cancel(): void {
    this.status = TaskStatus.cancel;
    this.xhr?.abort();
    this.update();
  }

  /** 上传进度 0~100。 */
  progress(): number {
    return this._progress;
  }
}
