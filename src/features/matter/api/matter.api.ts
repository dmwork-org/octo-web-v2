import { ofetch } from "ofetch";
import { authStore } from "@/features/base/stores/auth";
import { spaceStore } from "@/features/base/stores/space";
import type {
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

/**
 * Matter 服务独立 baseURL `/matter/api/v1`(走 vite proxy → 主网关 nginx →
 * todos service)。这里**不**走 features/base/api/client(那是 wkhttp 的 /v1/*
 * baseURL),保留独立 ofetch instance。
 *
 * Headers:
 * - `token`         — wkhttp 同款,从 authStore 读
 * - `X-Space-Id`    — matter service 强制要求(否则 400 VALIDATION_ERROR),
 *                     从 spaceStore 读;Space 未选时 header 不带,后端会再次拒,
 *                     view 层用 currentSpaceId 占位避免发请求
 *
 * 错误返回结构:`{ error: { code, message } }`,P3 后续 wave 加全局 401 redirect。
 */

const matterApi = ofetch.create({
  baseURL: "/matter/api/v1",
  onRequest: ({ options }) => {
    const headers = new Headers(options.headers);
    const token = authStore.state.token;
    if (token) headers.set("token", token);
    const spaceId = spaceStore.state.spaceId;
    if (spaceId) headers.set("X-Space-Id", spaceId);
    options.headers = headers;
  },
});

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

// ─── Channels(关联会话) ─────────────────────────────────

export interface LinkChannelReq {
  channel_id: string;
  channel_type: number;
  channel_name?: string;
}

/** 关联会话:POST /matters/{id}/channels { channel_id, channel_type, channel_name } */
export async function linkChannel(matterId: string, req: LinkChannelReq): Promise<void> {
  await matterApi(`/matters/${matterId}/channels`, { method: "POST", body: req });
}

/** 解除关联:DELETE /matters/{id}/channels/{channel_id} */
export async function unlinkChannel(matterId: string, channelId: string): Promise<void> {
  await matterApi(`/matters/${matterId}/channels/${encodeURIComponent(channelId)}`, {
    method: "DELETE",
  });
}

// ─── Timeline(评论 / 时间线) ─────────────────────────

/** 列表:GET /matters/{id}/timeline?source_channel_id&limit&cursor */
export async function listTimeline(
  matterId: string,
  params?: { source_channel_id?: string; limit?: number; cursor?: string },
): Promise<PaginatedList<TimelineEntry>> {
  return matterApi<PaginatedList<TimelineEntry>>(`/matters/${matterId}/timeline`, {
    query: params,
  });
}

/** 添加:POST /matters/{id}/timeline { content, attachments? } */
export async function addTimelineEntry(
  matterId: string,
  req: AddTimelineReq,
): Promise<TimelineEntry> {
  return matterApi<TimelineEntry>(`/matters/${matterId}/timeline`, {
    method: "POST",
    body: req,
  });
}

/** 删除:DELETE /matters/{id}/timeline/{entry_id} */
export async function deleteTimelineEntry(matterId: string, entryId: string): Promise<void> {
  await matterApi(`/matters/${matterId}/timeline/${encodeURIComponent(entryId)}`, {
    method: "DELETE",
  });
}
