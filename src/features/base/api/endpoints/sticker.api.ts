import { api } from "@/features/base/api/client";
import { getUploadCredentials } from "@/features/base/api/endpoints/upload.api";

export interface StickerItem {
  id?: string;
  sticker_id?: string;
  category?: string;
  path: string;
  url?: string;
  placeholder?: string;
  format?: string;
  name?: string;
}

interface StickerListResp {
  list?: StickerItem[];
}

export async function listUserStickers(opts?: { silent?: boolean }): Promise<StickerItem[]> {
  try {
    const resp = await api<StickerListResp>("sticker/user", {
      method: "GET",
      ...(opts?.silent ? ({ silent: true } as Parameters<typeof api<StickerListResp>>[1]) : {}),
    });
    return Array.isArray(resp?.list) ? resp.list : [];
  } catch {
    return [];
  }
}

export async function addUserSticker(req: {
  path: string;
  format: string;
  placeholder?: string;
}): Promise<StickerItem> {
  return api<StickerItem>("sticker/user", {
    method: "POST",
    body: req,
  });
}

export async function deleteUserSticker(stickerId: string): Promise<void> {
  await api(`sticker/user/${encodeURIComponent(stickerId)}`, { method: "DELETE" });
}

export async function uploadStickerFile(file: File): Promise<{ path: string; format: string }> {
  const format = fileExtension(file.name) || mimeExtension(file.type) || "png";
  const credentials = await getUploadCredentials(
    {
      path: `stickers/${Date.now()}-${sanitizeFilename(file.name)}`,
      type: "sticker",
      filename: file.name,
      contentType: file.type || "application/octet-stream",
      fileSize: file.size,
    },
    { silent: true },
  );

  const resp = await fetch(credentials.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": credentials.contentType || file.type || "application/octet-stream" },
    body: file,
  });
  if (!resp.ok) {
    throw new Error(`sticker upload failed: ${resp.status}`);
  }
  return { path: credentials.downloadUrl, format };
}

function fileExtension(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

function mimeExtension(mime: string): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/gif") return "gif";
  if (mime === "image/webp") return "webp";
  return "";
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+/, "") || "sticker";
}
