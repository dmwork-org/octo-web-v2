import { api } from "@/features/base/api/client";

/**
 * COS 直传凭证(对应旧 dmworkdatasource/src/task.ts::getUploadCredentials)。
 *
 * GET /v1/file/upload/credentials
 *   ?path=...&type=chat&filename=...&contentType=...&fileSize=...
 *
 * Resp:
 *   uploadUrl(预签名 PUT 直传 URL,带签名)
 *   downloadUrl(展示/下载 URL)
 *   contentType / contentDisposition
 *   key / expiredTime
 */

export interface UploadCredentials {
  uploadUrl: string;
  downloadUrl: string;
  contentType: string;
  contentDisposition?: string;
  key: string;
  expiredTime: number;
}

interface UploadParams {
  path: string;
  type: string; // "chat" / "avatar" / ...
  filename: string;
  contentType: string;
  fileSize: number;
}

export async function getUploadCredentials(params: UploadParams): Promise<UploadCredentials> {
  return api<UploadCredentials>("file/upload/credentials", {
    method: "GET",
    params: {
      path: params.path,
      type: params.type,
      filename: params.filename,
      contentType: params.contentType,
      fileSize: params.fileSize,
    },
  });
}
