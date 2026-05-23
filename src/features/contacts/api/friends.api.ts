import { api } from "@/features/base/api/client";
import type { Friend } from "@/features/contacts/types/friend.types";

/**
 * 同步好友(对应旧 dmworkcontacts WKApp.dataSource.contactsSync,
 * 后端 /v1/friend/sync,swagger user/friend.yaml:174)。
 *
 * GET /v1/friend/sync?limit=200&version=0
 *   limit:本次拉取条数上限
 *   version:增量同步版本号(0=拉全量;P3-D2 接增量再细化 version 持久化)
 */
export interface SyncFriendsParams {
  limit?: number;
  version?: number;
}

export async function syncFriends(params: SyncFriendsParams = {}): Promise<Friend[]> {
  const resp = await api<Friend[]>("friend/sync", {
    method: "GET",
    params: {
      limit: params.limit ?? 200,
      version: params.version ?? 0,
    },
  });
  return resp ?? [];
}
