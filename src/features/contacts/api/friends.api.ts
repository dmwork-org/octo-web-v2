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

/**
 * 搜索好友(全平台 username / short_no / phone 模糊匹配)。
 * GET /v1/friend/search?keyword=...
 */
export async function searchFriends(keyword: string): Promise<Friend[]> {
  const trimmed = keyword.trim();
  if (!trimmed) return [];
  const resp = await api<Friend[]>("friend/search", {
    method: "GET",
    params: { keyword: trimmed },
  });
  return resp ?? [];
}

/**
 * 申请加好友(对应旧 datasource::friendApply)。
 * POST /v1/friend/apply { to_uid, remark, vercode }
 * vercode 来自搜索结果 Friend.vercode 字段(后端发的一次性凭证)。
 */
export async function applyFriend(req: {
  to_uid: string;
  remark?: string;
  vercode?: string;
}): Promise<void> {
  await api("friend/apply", {
    method: "POST",
    body: {
      to_uid: req.to_uid,
      remark: req.remark ?? "",
      vercode: req.vercode ?? "",
    },
  });
}
