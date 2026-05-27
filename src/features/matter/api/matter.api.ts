import { matterApi } from "./matter-client";
import type {
  ActivityEntry,
  AddTimelineReq,
  CreateMatterReq,
  Matter,
  MatterDetail,
  MatterListParams,
  MatterStatus,
  PaginatedList,
  TimelineEntry,
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

// ─── Timeline(评论 / 时间线)─────────────────────────────

/** GET /matters/{id}/timeline?source_channel_id&limit&cursor */
export async function listTimeline(
  matterId: string,
  params?: { source_channel_id?: string; limit?: number; cursor?: string },
): Promise<PaginatedList<TimelineEntry>> {
  return matterApi<PaginatedList<TimelineEntry>>(`/matters/${matterId}/timeline`, {
    query: params,
  });
}

/** POST /matters/{id}/timeline { content, channel_id?, channel_type?, channel_name? } */
export async function addTimelineEntry(
  matterId: string,
  req: AddTimelineReq,
): Promise<TimelineEntry> {
  return matterApi<TimelineEntry>(`/matters/${matterId}/timeline`, {
    method: "POST",
    body: req,
  });
}

/** DELETE /matters/{id}/timeline/{entry_id} */
export async function deleteTimelineEntry(matterId: string, entryId: string): Promise<void> {
  await matterApi(`/matters/${matterId}/timeline/${encodeURIComponent(entryId)}`, {
    method: "DELETE",
  });
}

// ─── Activities(变更记录,只读)──────────────────────────

/** GET /matters/{id}/activities?limit&cursor */
export async function listActivities(
  matterId: string,
  params?: { limit?: number; cursor?: string },
): Promise<PaginatedList<ActivityEntry>> {
  return matterApi<PaginatedList<ActivityEntry>>(`/matters/${matterId}/activities`, {
    query: params,
  });
}
