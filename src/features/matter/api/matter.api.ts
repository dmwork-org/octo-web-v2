import { matterApi } from "./matter-client";
import type {
  ExtractMatterReq,
  ExtractResult,
  ActivityEntry,
  AddTimelineReq,
  CreateMatterReq,
  LinkChannelReq,
  ListOutputsParams,
  Matter,
  MatterChannel,
  MatterDetail,
  MatterListParams,
  MatterOutput,
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
  return matterApi<MatterDetail>(`/matters/${encodeURIComponent(matterId)}`, {
    query: sourceChannelId ? { source_channel_id: sourceChannelId } : undefined,
  });
}

export async function createMatter(req: CreateMatterReq): Promise<MatterDetail> {
  return matterApi<MatterDetail>("/matters", { method: "POST", body: req });
}

export async function updateMatter(matterId: string, req: UpdateMatterReq): Promise<MatterDetail> {
  return matterApi<MatterDetail>(`/matters/${encodeURIComponent(matterId)}`, {
    method: "PUT",
    body: req,
  });
}

export async function transitionMatter(
  matterId: string,
  status: MatterStatus,
): Promise<MatterDetail> {
  return matterApi<MatterDetail>(`/matters/${encodeURIComponent(matterId)}/status`, {
    method: "PUT",
    body: { status },
  });
}

export async function deleteMatter(matterId: string): Promise<void> {
  await matterApi(`/matters/${encodeURIComponent(matterId)}`, { method: "DELETE" });
}

// ─── Assignees ────────────────────────────────────────────

/** 添加受理人:POST /matters/{id}/assignees { user_id } */
export async function addAssignee(matterId: string, userId: string): Promise<void> {
  await matterApi(`/matters/${encodeURIComponent(matterId)}/assignees`, {
    method: "POST",
    body: { user_id: userId },
  });
}

/** 移除受理人:DELETE /matters/{id}/assignees/{user_id} */
export async function removeAssignee(matterId: string, userId: string): Promise<void> {
  await matterApi(
    `/matters/${encodeURIComponent(matterId)}/assignees/${encodeURIComponent(userId)}`,
    {
      method: "DELETE",
    },
  );
}

// ─── Timeline(评论 / 时间线)─────────────────────────────

/** GET /matters/{id}/timeline?source_channel_id&limit&cursor */
export async function listTimeline(
  matterId: string,
  params?: { source_channel_id?: string; limit?: number; cursor?: string },
): Promise<PaginatedList<TimelineEntry>> {
  return matterApi<PaginatedList<TimelineEntry>>(
    `/matters/${encodeURIComponent(matterId)}/timeline`,
    {
      query: params,
      // 只读子请求:失败由调用方内联空/错误态展示,跳过全局 toast(对齐旧 dmworktodo
      // 静默 catch)。嵌入场景下非创建人/负责人会拿到 403,不应弹窗打扰。
      silent: true,
    } as Parameters<typeof matterApi<PaginatedList<TimelineEntry>>>[1],
  );
}

/** POST /matters/{id}/timeline { content, channel_id?, channel_type?, channel_name? } */
export async function addTimelineEntry(
  matterId: string,
  req: AddTimelineReq,
): Promise<TimelineEntry> {
  return matterApi<TimelineEntry>(`/matters/${encodeURIComponent(matterId)}/timeline`, {
    method: "POST",
    body: req,
  });
}

/**
 * Summary 上游的"转发到 Matters"语义是给目标事项追加一条评论。
 * 新版 Matter 仍保留 comments endpoint,这里独立暴露给 summary 使用。
 */
export async function addMatterComment(matterId: string, content: string): Promise<void> {
  await matterApi(`/matters/${matterId}/comments`, {
    method: "POST",
    body: { content },
  });
}

/** DELETE /matters/{id}/timeline/{entry_id} */
export async function deleteTimelineEntry(matterId: string, entryId: string): Promise<void> {
  await matterApi(
    `/matters/${encodeURIComponent(matterId)}/timeline/${encodeURIComponent(entryId)}`,
    {
      method: "DELETE",
    },
  );
}

// ─── Activities(变更记录,只读)──────────────────────────

/** GET /matters/{id}/activities?limit&cursor */
export async function listActivities(
  matterId: string,
  params?: { limit?: number; cursor?: string },
): Promise<PaginatedList<ActivityEntry>> {
  return matterApi<PaginatedList<ActivityEntry>>(
    `/matters/${encodeURIComponent(matterId)}/activities`,
    {
      query: params,
      // 只读子请求:失败由 ActivityList 内联错误态展示,跳过全局 toast。
      silent: true,
    } as Parameters<typeof matterApi<PaginatedList<ActivityEntry>>>[1],
  );
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
  return matterApi<MatterChannel>(`/matters/${encodeURIComponent(matterId)}/channels`, {
    method: "POST",
    body: req,
  });
}

/** DELETE /matters/{id}/channels/{channel_id} */
export async function unlinkChannel(matterId: string, channelId: string): Promise<void> {
  await matterApi(
    `/matters/${encodeURIComponent(matterId)}/channels/${encodeURIComponent(channelId)}`,
    {
      method: "DELETE",
    },
  );
}

// ─── Outputs (产出文件) ─────────────────────────────────

/** GET /matters/{id}/outputs?limit&cursor&q */
export async function listOutputs(
  matterId: string,
  params?: ListOutputsParams,
): Promise<PaginatedList<MatterOutput>> {
  return matterApi<PaginatedList<MatterOutput>>(
    `/matters/${encodeURIComponent(matterId)}/outputs`,
    {
      query: params,
      // 只读子请求:失败由 OutputsPanel 内联错误态 + 重试按钮展示,跳过全局 toast
      // (对齐旧 dmworktodo loadOutputs 静默 catch)。
      silent: true,
    } as Parameters<typeof matterApi<PaginatedList<MatterOutput>>>[1],
  );
}
