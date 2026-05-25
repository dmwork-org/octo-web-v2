import { api } from "@/features/base/api/client";
import { spaceStore } from "@/features/base/stores/space";
import type { FriendApply } from "@/features/contacts/types/friend-apply.types";

/**
 * 新好友申请相关 endpoints(对应旧 dmworkcontacts NewFriend/vm.tsx + datasource::friendSure)。
 *
 * GET    /v1/friend/apply?page_index&page_size  → FriendApply[]
 * POST   /v1/friend/sure  { token, space_id? } → 接受申请
 * DELETE /v1/friend/apply/{to_uid}              → 删除/拒绝申请
 * DELETE /v1/user/reddot/friendApply            → 清空 reddot
 */

interface ListParams {
  page_index?: number;
  page_size?: number;
}

export async function getFriendApplies(params: ListParams = {}): Promise<FriendApply[]> {
  const resp = await api<FriendApply[]>("friend/apply", {
    method: "GET",
    params: {
      page_index: params.page_index ?? 1,
      page_size: params.page_size ?? 999,
    },
  });
  return resp ?? [];
}

export async function acceptFriendApply(token: string): Promise<void> {
  const spaceId = spaceStore.state.spaceId;
  const body: Record<string, unknown> = { token };
  if (spaceId) body.space_id = spaceId;
  await api("friend/sure", { method: "POST", body });
}

export async function deleteFriendApply(toUid: string): Promise<void> {
  await api(`friend/apply/${encodeURIComponent(toUid)}`, { method: "DELETE" });
}

export async function clearFriendApplyReddot(): Promise<void> {
  await api("user/reddot/friendApply", { method: "DELETE" });
}
