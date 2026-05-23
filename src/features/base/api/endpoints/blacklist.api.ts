import { api } from "@/features/base/api/client";

/**
 * 黑名单 endpoints(对应旧 CommonDataSource::blacklistAdd / blacklistRemove)。
 *
 * - POST   /v1/user/blacklist/{uid}  加黑(对方将无法发消息给我)
 * - DELETE /v1/user/blacklist/{uid}  出黑
 */

export async function blacklistAdd(uid: string): Promise<void> {
  await api(`user/blacklist/${encodeURIComponent(uid)}`, { method: "POST" });
}

export async function blacklistRemove(uid: string): Promise<void> {
  await api(`user/blacklist/${encodeURIComponent(uid)}`, { method: "DELETE" });
}
