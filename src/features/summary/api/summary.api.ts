import { ofetch } from "ofetch";
import { authStore } from "@/features/base/stores/auth";
import { spaceStore } from "@/features/base/stores/space";
import type {
  CreateScheduleParams,
  CreateSummaryParams,
  ListSummariesParams,
  ListSummariesResponse,
  ScheduleItem,
  SummaryDetail,
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
  onResponseError: ({ response }) => {
    const body = response._data as { error?: { message?: string }; message?: string } | undefined;
    const msg = body?.error?.message ?? body?.message;
    if (msg) {
      throw new Error(msg);
    }
  },
});

// ─── Core ─────────────────────────────────────────────────

export async function listSummaries(params: ListSummariesParams): Promise<ListSummariesResponse> {
  return summaryApi<ListSummariesResponse>("/summaries", { query: params });
}

export async function getSummaryDetail(taskId: number): Promise<SummaryDetail> {
  return summaryApi<SummaryDetail>(`/summaries/${taskId}`);
}

export async function createSummary(params: CreateSummaryParams): Promise<{ task_id: number }> {
  return summaryApi<{ task_id: number }>("/summaries", { method: "POST", body: params });
}

export async function deleteSummary(taskId: number): Promise<void> {
  await summaryApi(`/summaries/${taskId}`, { method: "DELETE" });
}

export async function regenerateSummary(taskId: number): Promise<{ task_id: number }> {
  return summaryApi<{ task_id: number }>(`/summaries/${taskId}/regenerate`, { method: "POST" });
}

export async function cancelSummary(taskId: number): Promise<void> {
  await summaryApi(`/summaries/${taskId}/cancel`, { method: "PUT" });
}

// ─── Schedule CRUD(Wave 3b) ─────────────────────────────

export async function listSchedules(): Promise<ScheduleItem[]> {
  const data = await summaryApi<ScheduleItem[] | null>("/summary-schedules");
  return data ?? [];
}

export async function getSchedule(scheduleId: number): Promise<ScheduleItem> {
  return summaryApi<ScheduleItem>(`/summary-schedules/${scheduleId}`);
}

export async function createSchedule(params: CreateScheduleParams): Promise<ScheduleItem> {
  return summaryApi<ScheduleItem>("/summary-schedules", { method: "POST", body: params });
}

export async function updateSchedule(
  scheduleId: number,
  params: UpdateScheduleParams,
): Promise<ScheduleItem> {
  return summaryApi<ScheduleItem>(`/summary-schedules/${scheduleId}`, {
    method: "PUT",
    body: params,
  });
}

export async function deleteSchedule(scheduleId: number): Promise<void> {
  await summaryApi(`/summary-schedules/${scheduleId}`, { method: "DELETE" });
}

export async function toggleSchedule(scheduleId: number, isActive: boolean): Promise<ScheduleItem> {
  return summaryApi<ScheduleItem>(`/summary-schedules/${scheduleId}/toggle`, {
    method: "PUT",
    body: { is_active: isActive },
  });
}
