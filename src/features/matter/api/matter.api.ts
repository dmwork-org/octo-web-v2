import { matterApi } from "./matter-client";
import type {
  CreateMatterReq,
  Matter,
  MatterDetail,
  MatterListParams,
  MatterStatus,
  PaginatedList,
  UpdateMatterReq,
} from "@/features/matter/types/matter.types";

// ─── Matters ───────────────────────────────────────────────

export async function listMatters(params?: MatterListParams): Promise<PaginatedList<Matter>> {
  return matterApi<PaginatedList<Matter>>("/matters", { query: params });
}

export async function getMatter(matterId: string, sourceChannelId?: string): Promise<MatterDetail> {
  return matterApi<MatterDetail>(`/matters/${matterId}`, {
    query: sourceChannelId ? { source_channel_id: sourceChannelId } : undefined,
  });
}

export async function createMatter(req: CreateMatterReq): Promise<MatterDetail> {
  return matterApi<MatterDetail>("/matters", { method: "POST", body: req });
}

export async function updateMatter(matterId: string, req: UpdateMatterReq): Promise<MatterDetail> {
  return matterApi<MatterDetail>(`/matters/${matterId}`, { method: "PUT", body: req });
}

export async function transitionMatter(
  matterId: string,
  status: MatterStatus,
): Promise<MatterDetail> {
  return matterApi<MatterDetail>(`/matters/${matterId}/status`, {
    method: "PUT",
    body: { status },
  });
}

export async function deleteMatter(matterId: string): Promise<void> {
  await matterApi(`/matters/${matterId}`, { method: "DELETE" });
}

// ─── Assignees ────────────────────────────────────────────

/** 添加受理人:POST /matters/{id}/assignees { user_id } */
export async function addAssignee(matterId: string, userId: string): Promise<void> {
  await matterApi(`/matters/${matterId}/assignees`, {
    method: "POST",
    body: { user_id: userId },
  });
}

/** 移除受理人:DELETE /matters/{id}/assignees/{user_id} */
export async function removeAssignee(matterId: string, userId: string): Promise<void> {
  await matterApi(`/matters/${matterId}/assignees/${encodeURIComponent(userId)}`, {
    method: "DELETE",
  });
}
