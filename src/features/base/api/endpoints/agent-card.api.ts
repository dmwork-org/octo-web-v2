import { authStore } from "@/features/base/stores/auth";

/**
 * Agent Card 接口 + 类型(对齐老仓 dmworkbase/Service/AgentCardService.ts +
 * dmworkbase/Types/AgentCard.ts)。
 *
 * Agent-card-server 是独立服务,endpoint 路径带 `/api/v1/` 前缀(线上
 * `/api/v1/agent-cards/...`,不是主 wukong server 的 `/v1/`)。本地 vite proxy
 * 必须有 `/api/v1/agent-cards` 不 rewrite 的 rule(见 vite.config.ts),
 * 否则会被通用 `/api → /v1` rewrite 抹掉前缀变 `/v1/v1/...` → 404。
 *
 * 测试环境可能没部署 → 静默失败返 null(同 `getAgentReportStatus` 思路),
 * 不弹 toast。**故意绕过 base/api/client** 的全局 withErrorToast 拦截器,
 * 用裸 fetch + 手动注入 token。
 *
 * Endpoint(envelope: `{ code, message, data }`):
 * - GET `/api/v1/agent-cards/{botId}`              → AgentCardData(概览 / Session / Files)
 * - GET `/api/v1/agent-cards/{botId}/files/{name}` → FileContentData(单文件完整内容)
 */

export type SessionStatus = "running" | "done" | "failed" | "killed" | "timeout";
export type PeerType = "private" | "group";
export type ChannelType = "octo" | "discord" | "dmwork" | "telegram" | (string & {});
export type CoreFileCategory = "identity" | "tools" | "config";
export type ProcessStatus = "running" | "idle" | "stopped";
export type GatewayStatus = "connected" | "disconnected";

export interface RuntimeInfo {
  os_version: string;
  arch: string;
  disk_space_gb: number;
  memory_gb: number;
  app_data_dir: string;
  claw_version: string;
  admin_url: string;
  team_name: string;
  process_status: ProcessStatus;
  gateway_status: GatewayStatus;
  gateway_name: string;
  claw_id: string;
  gateway_total_agents: number;
  gateway_alive_agents: number;
  nodejs_version: string;
  network_latency_ms: number | null;
  last_heartbeat_at: string;
  memory_retention_count: number;
  memory_retention_note: string;
}

export interface SessionInfo {
  session_id: string;
  session_key: string;
  channel: ChannelType;
  status: SessionStatus;
  peer_name: string;
  peer_display_name: string;
  peer_type: PeerType;
  group_member_count: number | null;
  model: string;
  context_used: number;
  context_total: number;
  context_percent: number;
  last_user_message: string;
  last_active_at: string;
}

export interface CoreFile {
  file_name: string;
  category: CoreFileCategory;
  file_size: number;
  content_preview: string;
  last_synced_at: string;
}

export interface MemoryFile {
  file_name: string;
  file_size: number;
  content_preview: string;
  last_synced_at: string;
}

export interface AgentCardData {
  bot_id: string;
  session_total: number;
  session_running_count: number;
  last_report_at: string;
  runtime_info: RuntimeInfo;
  sessions: SessionInfo[];
  core_files: CoreFile[];
  memory_files: MemoryFile[];
}

export interface FileContentData {
  bot_id: string;
  file_name: string;
  content_type: string;
  file_size: number;
  content: string;
  last_synced_at: string;
}

interface Envelope<T> {
  code?: number;
  message?: string;
  data?: T;
}

async function fetchEnvelope<T>(path: string): Promise<T | null> {
  try {
    const token = authStore.state.token ?? "";
    const resp = await fetch(path, { headers: { token } });
    if (!resp.ok) return null;
    const body = (await resp.json()) as Envelope<T>;
    if (body.code !== 0) return null;
    return body.data ?? null;
  } catch {
    return null;
  }
}

/**
 * 获取 Agent Card(概览 / Session / Files)。
 *
 * 失败(404 / 网络错 / code !== 0)返 null,UI 显空态。
 */
export async function getAgentCard(botId: string): Promise<AgentCardData | null> {
  return fetchEnvelope<AgentCardData>(`/api/v1/agent-cards/${encodeURIComponent(botId)}`);
}

/**
 * 获取 Agent 单文件完整内容(供 FileViewer)。
 *
 * `fileName` 可带子路径(如 `memory/2026-05-07.md`),encodeURIComponent 整体编码
 * (后端按整体 path 解析,对齐老仓 `encodeURIComponent(fileName)`)。
 */
export async function getAgentFileContent(
  botId: string,
  fileName: string,
): Promise<FileContentData | null> {
  return fetchEnvelope<FileContentData>(
    `/api/v1/agent-cards/${encodeURIComponent(botId)}/files/${encodeURIComponent(fileName)}`,
  );
}
