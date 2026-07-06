import { ofetch } from "ofetch";
import { authStore } from "@/features/base/stores/auth";
import { spaceStore } from "@/features/base/stores/space";
import type {
  BatchStatusItem,
  BatchStatusResponse,
  ChatCandidate,
  CreateScheduleParams,
  CreateSummaryParams,
  ListSummariesParams,
  ListSummariesResponse,
  MemberCandidate,
  MemberStatus,
  PersonalResult,
  ScheduleItem,
  SourceItem,
  SummaryDetail,
  TopicTemplate,
  UpdateScheduleParams,
} from "@/features/summary/types/summary.types";

/**
 * Summary 服务独立 baseURL `/summary/api/v1`(走 vite proxy → 主网关 nginx →
 * summary service)。
 *
 * Headers:`token` + `X-Space-Id`(同 matter)。
 *
 * **响应 envelope unwrap**:summary service 返回 `{ code, message, data: T }`,
 * onResponse 里把 `_data = _data.data` 透传,对调用层就是直接拿 T。错误时后端用
 * `{ error: { message } }` 或 `{ message }`,ofetch 默认 throw,这里在 onResponseError
 * 里把 message 抽出来,业务层 toast 直接读 err.message。
 *
 * **AbortError 透传**:`AbortController.abort()` 抛出的 DOMException
 * `name === "AbortError"`,上层(chat panel fetchSummaryCount / loadHistory)依赖
 * `err.name === "AbortError"` 区分"主动取消"vs"真错误",所以这里 throw 不能覆盖
 * AbortError(对齐老仓 `axios.isCancel(err) → throw err` 行为)。ofetch 在 request
 * abort 时不会进 onResponseError,但加 guard 兜底防错路径。
 */

const summaryApi = ofetch.create({
  baseURL: "/summary/api/v1",
  onRequest: ({ options }) => {
    const headers = new Headers(options.headers);
    const token = authStore.state.token;
    if (token) headers.set("token", token);
    const spaceId = spaceStore.state.spaceId;
    if (spaceId) headers.set("X-Space-Id", spaceId);
    options.headers = headers;
  },
  onResponse: ({ response }) => {
    const body = response._data as { data?: unknown; code?: number } | undefined;
    if (body && typeof body === "object" && "data" in body) {
      response._data = body.data;
    }
  },
  onResponseError: ({ response, error }) => {
    if (error?.name === "AbortError") return;
    const body = response._data as { error?: { message?: string }; message?: string } | undefined;
    const msg = body?.error?.message ?? body?.message;
    if (msg) {
      throw new Error(msg);
    }
  },
});

function stripSourceNames(sources: SourceItem[] | undefined): SourceItem[] | undefined {
  return sources?.map((source) => ({
    source_type: source.source_type,
    source_id: source.source_id,
  }));
}

function normalizeCreateSummaryParams(params: CreateSummaryParams): CreateSummaryParams {
  return { ...params, sources: stripSourceNames(params.sources) };
}

function normalizeCreateScheduleParams(params: CreateScheduleParams): CreateScheduleParams {
  return { ...params, sources: stripSourceNames(params.sources) ?? [] };
}

function normalizeUpdateScheduleParams(params: UpdateScheduleParams): UpdateScheduleParams {
  return { ...params, sources: stripSourceNames(params.sources) };
}

function normalizeScheduleItem(item: ScheduleItem): ScheduleItem {
  const active = item.is_active as unknown;
  const isActive =
    active === undefined || active === null
      ? true
      : active === true || active === 1 || active === "1" || active === "true";
  return {
    ...item,
    title: item.title ?? "",
    cron_expr: item.cron_expr ?? "",
    time_range_type:
      item.time_range_type === 1 ||
      item.time_range_type === 2 ||
      item.time_range_type === 3 ||
      item.time_range_type === 4
        ? item.time_range_type
        : 2,
    sources: item.sources ?? [],
    participants: item.participants ?? [],
    is_active: isActive,
    next_run_at: item.next_run_at ?? null,
  };
}

// ─── Core ─────────────────────────────────────────────────

export async function listSummaries(
  params: ListSummariesParams,
  config?: { signal?: AbortSignal },
): Promise<ListSummariesResponse> {
  return summaryApi<ListSummariesResponse>("/summaries", { query: params, signal: config?.signal });
}

export async function getSummaryDetail(taskId: number): Promise<SummaryDetail> {
  return summaryApi<SummaryDetail>(`/summaries/${taskId}`);
}

export async function createSummary(params: CreateSummaryParams): Promise<{ task_id: number }> {
  return summaryApi<{ task_id: number }>("/summaries", {
    method: "POST",
    body: normalizeCreateSummaryParams(params),
  });
}

export async function deleteSummary(taskId: number): Promise<void> {
  await summaryApi(`/summaries/${taskId}`, { method: "DELETE" });
}

export async function leaveSummary(taskId: number): Promise<void> {
  await summaryApi(`/summaries/${taskId}/leave`, { method: "POST" });
}

export async function removeMember(taskId: number, uid: string): Promise<void> {
  await summaryApi(`/summaries/${taskId}/members`, {
    method: "DELETE",
    query: { uid },
  });
}

export async function regenerateSummary(
  taskId: number,
  body?: { topic?: string },
): Promise<{ task_id: number }> {
  return summaryApi<{ task_id: number }>(`/summaries/${taskId}/regenerate`, {
    method: "POST",
    body,
  });
}

type EditSummaryResponse = { edited_at: string };
type EditSummaryRawBody =
  | EditSummaryResponse
  | {
      data?: EditSummaryResponse;
      error?: { message?: string };
      message?: string;
    };

function extractEditSummaryError(body: EditSummaryRawBody | undefined): string {
  if (!body || typeof body !== "object") return "Request failed";
  if ("error" in body && body.error?.message) return body.error.message;
  if ("message" in body && body.message) return body.message;
  return "Request failed";
}

function unwrapEditSummary(body: EditSummaryRawBody | undefined): EditSummaryResponse {
  if (body && typeof body === "object" && "data" in body && body.data) return body.data;
  return body as EditSummaryResponse;
}

/**
 * 编辑总结正文。这里不用普通 summaryApi 调用,因为 409 需要保留 HTTP status,
 * 上层据此按上游逻辑提示"内容已更新,请刷新"。
 */
export async function editSummary(
  taskId: number,
  content: string,
  baseResultId: number,
): Promise<EditSummaryResponse> {
  const response = await summaryApi.raw<EditSummaryRawBody>(`/summaries/${taskId}/edit`, {
    method: "PUT",
    body: { content, base_result_id: baseResultId },
    ignoreResponseError: true,
  });
  if (response.status >= 400) {
    const err = new Error(extractEditSummaryError(response._data)) as Error & { status?: number };
    err.status = response.status;
    throw err;
  }
  return unwrapEditSummary(response._data);
}

export async function personalEditSummary(
  taskId: number,
  content: string,
): Promise<EditSummaryResponse> {
  return summaryApi<EditSummaryResponse>(`/summaries/${taskId}/personal-edit`, {
    method: "PUT",
    body: { content },
  });
}

export async function cancelSummary(taskId: number): Promise<void> {
  await summaryApi(`/summaries/${taskId}/cancel`, { method: "PUT" });
}

export async function respondToTask(taskId: number, action: "accept" | "reject"): Promise<void> {
  await summaryApi(`/summaries/${taskId}/respond`, { method: "POST", body: { action } });
}

/**
 * 批量查询任务状态(chat panel 列表轮询用,避免对每个任务发独立 GET)。
 * 对齐老仓 `summaryApi.batchStatus`,内部 POST 拿 envelope `{ tasks: [...] }`。
 */
export async function batchStatus(taskIds: number[]): Promise<BatchStatusItem[]> {
  const data = await summaryApi<BatchStatusResponse>("/summaries/batch-status", {
    method: "POST",
    body: { task_ids: taskIds },
  });
  return data?.tasks ?? [];
}

// ─── Schedule CRUD(Wave 3b) ─────────────────────────────

export async function listSchedules(): Promise<ScheduleItem[]> {
  const data = await summaryApi<ScheduleItem[] | null>("/summary-schedules");
  return (data ?? []).map(normalizeScheduleItem);
}

export async function getSchedule(scheduleId: number): Promise<ScheduleItem> {
  const data = await summaryApi<ScheduleItem>(`/summary-schedules/${scheduleId}`);
  return normalizeScheduleItem(data);
}

export async function createSchedule(params: CreateScheduleParams): Promise<ScheduleItem> {
  const data = await summaryApi<ScheduleItem>("/summary-schedules", {
    method: "POST",
    body: normalizeCreateScheduleParams(params),
  });
  return normalizeScheduleItem(data);
}

export async function updateSchedule(
  scheduleId: number,
  params: UpdateScheduleParams,
): Promise<ScheduleItem> {
  const data = await summaryApi<ScheduleItem>(`/summary-schedules/${scheduleId}`, {
    method: "PUT",
    body: normalizeUpdateScheduleParams(params),
  });
  return normalizeScheduleItem(data);
}

export async function deleteSchedule(scheduleId: number): Promise<void> {
  await summaryApi(`/summary-schedules/${scheduleId}`, { method: "DELETE" });
}

export async function toggleSchedule(scheduleId: number, isActive: boolean): Promise<ScheduleItem> {
  const data = await summaryApi<ScheduleItem>(`/summary-schedules/${scheduleId}/toggle`, {
    method: "PUT",
    body: { is_active: isActive },
  });
  return normalizeScheduleItem(data);
}

export async function confirmSchedule(scheduleId: number): Promise<void> {
  await summaryApi(`/summary-schedules/${scheduleId}/confirm`, { method: "POST" });
}

// ─── BY_PERSON / Personal Mode(Wave 3c) ────────────────

/** 个人模式被邀请用户确认参与 + 选定参与来源 */
export async function confirmParticipation(taskId: number, sources: SourceItem[]): Promise<void> {
  await summaryApi(`/summaries/${taskId}/confirm`, {
    method: "POST",
    body: {
      sources: sources.map((s) => ({ source_type: s.source_type, source_id: s.source_id })),
    },
  });
}

/** 个人模式拒绝参与 */
export async function declineParticipation(taskId: number): Promise<void> {
  await summaryApi(`/summaries/${taskId}/decline`, { method: "POST" });
}

/** 当前用户在个人模式下的总结结果 */
export async function getPersonalResult(taskId: number): Promise<PersonalResult> {
  return summaryApi<PersonalResult>(`/summaries/${taskId}/personal`);
}

/** 提交个人总结(从 pending 转 submitted) */
export async function submitPersonalResult(taskId: number): Promise<void> {
  await summaryApi(`/summaries/${taskId}/submit`, { method: "POST" });
}

/** 所有成员状态(创建人视角看每个 participant 的提交进度) */
export async function getMembers(taskId: number): Promise<MemberStatus[]> {
  const data = await summaryApi<{ members?: MemberStatus[] } | null>(
    `/summaries/${taskId}/members`,
  );
  return data?.members ?? [];
}

export async function addMembers(taskId: number, userIds: string[]): Promise<void> {
  await summaryApi(`/summaries/${taskId}/members`, {
    method: "POST",
    body: { user_ids: userIds },
  });
}

// ─── Chat-context candidates + templates(Batch 1.11) ────

/**
 * 拉远端"可作为总结来源的会话候选"列表(chat-selector 多选弹窗用)。
 * 后端返回当前 space 内所有可访问的 group / thread / direct,跟最近会话不同,
 * 是"全量授权列表",所以不能用本仓 conversationsQueryOptions 替代。
 */
export async function getChatCandidates(params?: {
  keyword?: string;
  chat_type?: string;
  include_archived?: boolean;
}): Promise<ChatCandidate[]> {
  const data = await summaryApi<ChatCandidate[] | null>("/summary-chat-candidates", {
    query: params,
  });
  return data ?? [];
}

/** 成员候选(添加 participant 弹窗用,本期 chat panel 未直接用,留接口对齐老仓)。 */
export async function getMemberCandidates(params?: {
  keyword?: string;
}): Promise<MemberCandidate[]> {
  const data = await summaryApi<MemberCandidate[] | null>("/summary-member-candidates", {
    query: params,
  });
  return data ?? [];
}

/**
 * 拉远端 topic 模板列表。后端没配时返回空数组,UI 走前端 TOPIC_TEMPLATES 兜底
 * (对齐老仓 ChatSummaryNewModal.loadTemplates fallback)。
 */
export async function getTopicTemplates(): Promise<TopicTemplate[]> {
  const data = await summaryApi<{ templates?: TopicTemplate[] } | null>("/summary-templates");
  return data?.templates ?? [];
}
