import { matterApi } from "./matter-client";
import type {
  ExtractMatterReq,
  ExtractResult,
  ActivityEntry,
  AddTimelineReq,
  CreateMatterReq,
  LinkChannelReq,
  Matter,
  MatterChannel,
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

// ─── Extract(AI 智能创建,对应旧 dmworktodo extractMatter)──────

/**
 * 从一组聊天消息抽取并创建事项(对应旧 dmworktodo/api/todoApi.ts:243):
 * POST /matters/extract  body: ExtractMatterReq → ExtractResult
 *
 * 后端接收 chat msgs(message_id / from_uid / content / attachments)+ source
 * channel,LLM 抽取后**直接创建一条 matter 记录**返回 id;前端可立即跳详情
 * 编辑(title/description 由 AI 填,通常需要 user 二次确认 / 修改 → 走 updateMatter)。
 */
export async function extractMatter(req: ExtractMatterReq): Promise<ExtractResult> {
  return matterApi<ExtractResult>("/matters/extract", { method: "POST", body: req });
}

// ─── Channels(关联群聊)────────────────────────────────

/** POST /matters/{id}/channels { channel_id, channel_type, channel_name? } */
export async function linkChannel(matterId: string, req: LinkChannelReq): Promise<MatterChannel> {
  return matterApi<MatterChannel>(`/matters/${matterId}/channels`, { method: "POST", body: req });
}

/** DELETE /matters/{id}/channels/{channel_id} */
export async function unlinkChannel(matterId: string, channelId: string): Promise<void> {
  await matterApi(`/matters/${matterId}/channels/${encodeURIComponent(channelId)}`, {
    method: "DELETE",
  });
}
