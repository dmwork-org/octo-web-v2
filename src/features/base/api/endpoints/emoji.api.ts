import { api } from "@/features/base/api/client";

export interface EmojiManifestItem {
  key: string;
  name?: string;
  url?: string;
}

export interface EmojiManifest {
  version?: number;
  list?: EmojiManifestItem[];
}

export async function getEmojiManifest(opts?: { silent?: boolean }): Promise<EmojiManifest> {
  return api<EmojiManifest>("common/emojis", {
    method: "GET",
    ...(opts?.silent ? ({ silent: true } as Parameters<typeof api<EmojiManifest>>[1]) : {}),
  });
}
