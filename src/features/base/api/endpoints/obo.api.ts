import { api } from "@/features/base/api/client";

/**
 * Persona / AI 分身(OBO = on-behalf-of)API。
 *
 * 对齐老仓 dmworkbase Components/PersonaSettings/vm.tsx。
 *
 * **Grant**(授权)— 一个用户向某 Bot 授予"代理回复"的权限:
 *   - mode="auto" / "draft"
 *   - global_enabled:全局总开关
 *   - active:同一用户最多 1 个 grant 处于活跃(后端互斥)
 *   - persona_prompt:回复风格 prompt(v2 新增,可选)
 *
 * **Scope**(范围)— 在 Grant 之下进一步控制"哪些频道启用":
 *   - per-channel 启用列表
 *
 * 后端 PR-A 可能未 merge,首次 GET 404 时降级显示"功能即将上线"(老仓 YUJ-1341)。
 */

export interface OboGrant {
  id: number;
  grantor_uid: string;
  grantee_bot_uid: string;
  mode: "auto" | "draft";
  global_enabled: boolean;
  active: boolean;
  persona_prompt?: string;
  created_at?: string;
  updated_at?: string;
}

export async function listGrants(): Promise<OboGrant[]> {
  const resp = await api<OboGrant[]>("obo/grants");
  return resp ?? [];
}

export interface CreateGrantPayload {
  grantee_bot_uid: string;
  mode: OboGrant["mode"];
  global_enabled: boolean;
  persona_prompt?: string;
}
export async function createGrant(payload: CreateGrantPayload): Promise<OboGrant> {
  return api<OboGrant>("obo/grants", { method: "POST", body: payload });
}

export interface UpdateGrantPayload {
  global_enabled?: boolean;
  active?: boolean;
  persona_prompt?: string;
}
export async function updateGrant(id: number, payload: UpdateGrantPayload): Promise<OboGrant> {
  return api<OboGrant>(`obo/grants/${id}`, { method: "PUT", body: payload });
}

export async function deleteGrant(id: number): Promise<void> {
  await api(`obo/grants/${id}`, { method: "DELETE" });
}

// ---------------------------------------------------------------------------
// Scope(grant 下的频道范围)
// ---------------------------------------------------------------------------

export interface OboScope {
  id: number;
  grant_id: number;
  channel_id: string;
  channel_type: number;
  created_at?: string;
}

export async function listScopes(grantId: number): Promise<OboScope[]> {
  const resp = await api<OboScope[]>(`obo/grants/${grantId}/scopes`);
  return resp ?? [];
}

export interface CreateScopePayload {
  grant_id: number;
  channel_id: string;
  channel_type: number;
}
export async function createScope(payload: CreateScopePayload): Promise<OboScope> {
  return api<OboScope>("obo/scopes", { method: "POST", body: payload });
}

export async function deleteScope(id: number): Promise<void> {
  await api(`obo/scopes/${id}`, { method: "DELETE" });
}

// ---------------------------------------------------------------------------
// Robot 候选(新建 Grant 时选 Bot 用)
// ---------------------------------------------------------------------------

export interface BotCandidate {
  uid: string;
  name: string;
  avatar?: string;
  description?: string;
}

export async function listMyBots(): Promise<BotCandidate[]> {
  const resp = await api<BotCandidate[]>("robot/my_bots");
  return resp ?? [];
}

export async function listSpaceBots(): Promise<BotCandidate[]> {
  const resp = await api<BotCandidate[]>("robot/space_bots");
  return resp ?? [];
}
