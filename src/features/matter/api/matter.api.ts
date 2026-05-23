import { ofetch } from "ofetch";
import { authStore } from "@/features/base/stores/auth";
import type {
  CreateMatterReq,
  Matter,
  MatterDetail,
  MatterListParams,
  MatterStatus,
  PaginatedList,
  UpdateMatterReq,
} from "@/features/matter/types/matter.types";

/**
 * Matter 服务独立 baseURL `/matter/api/v1`(走 vite proxy → 主网关 nginx →
 * todos service)。这里**不**走 features/base/api/client(那是 wkhttp 的 /v1/*
 * baseURL),保留独立 ofetch instance。
 *
 * Auth header:matter service 跟 wkhttp 一样接受自定义 `token` header,从 authStore 读取。
 *
 * 错误返回结构:`{ code, error, message }` 或纯文本。401 / 403 走全局 redirect
 * (需要)P3 后续 wave 加;现在先 throw 让 useQuery 拿到。
 */

const matterApi = ofetch.create({
  baseURL: "/matter/api/v1",
  onRequest: ({ options }) => {
    const token = authStore.state.token;
    if (token) {
      const headers = new Headers(options.headers);
      headers.set("token", token);
      options.headers = headers;
    }
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
