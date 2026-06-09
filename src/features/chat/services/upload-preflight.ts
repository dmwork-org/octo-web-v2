import type { Channel } from "wukongimjssdk";
import { getUploadCredentials } from "@/features/base/api/endpoints/upload.api";

/**
 * 上传前预检 file/upload/credentials(对齐上游 d8213ec1 / #119)。
 *
 * **Why**:后端会对文件类型 / 大小做白名单校验(例如 .xlsm 返回
 * `400 不支持的文件类型`)。SDK 内 `MediaMessageUploadTask.start()` 把
 * credentials 调用放在 `chatManager.send()` 之后,而 `send` 已经把消息气泡
 * 塞进 cache;credentials 失败只把 task 翻 fail、错误信息整个吞掉,用户看到
 * 一条假的"已发送"气泡且无任何提示,刷新后气泡消失。
 *
 * **How**:UI 调 `chatManager.send` 之前先打一次 credentials,失败直接
 * `throw` 后端 msg。成功路径多调一次 credentials(轻量 GET,可接受),换来
 * "拒收文件完全不进聊天框"的体验。
 *
 * 错误形状:抛出的 Error 的 `.message` 就是后端 `msg`(或兜底 "上传失败"),
 * UI 层直接读取拼 `文件「xxx」<msg>` toast 即可。
 */
export async function precheckUploadCredentials(
  file: File,
  channel: Channel,
  extension: string,
): Promise<void> {
  const contentType = file.type || "application/octet-stream";
  const filename = file.name || "file";
  const ext = extension ? `.${extension}` : "";
  const path = `/${channel.channelType}/${channel.channelID}/${genPreflightId()}${ext}`;
  try {
    const result = await getUploadCredentials(
      { path, type: "chat", filename, contentType, fileSize: file.size },
      { silent: true },
    );
    if (!result.uploadUrl || !result.downloadUrl) {
      throw new Error("响应缺少凭证字段");
    }
  } catch (err) {
    // ofetch FetchError 的 .data 是 response body;后端约定 { msg, status }
    const data = (err as { data?: { msg?: string; message?: string } }).data;
    const msg =
      data?.msg ||
      data?.message ||
      (err instanceof Error ? err.message : "") ||
      "上传失败";
    throw new Error(msg, { cause: err });
  }
}

/** 临时 path 占位 UUID;实际上传时 SDK task 内部会再 fetch 一次新凭证,不复用这里的 path。 */
function genPreflightId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
