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
  /** 后端可能填的 bot 名(对齐老仓 OboGrant.grantee_bot_name);缺失时 fallback uid。 */
  grantee_bot_name?: string;
  mode: "auto" | "draft";
  global_enabled: boolean;
  active: boolean;
  persona_prompt?: string;
  created_at?: string;
  updated_at?: string;
}

export async function listGrants(): Promise<OboGrant[]> {
  // 后端可能返 `{items: [...]}` 包装 / null / 空对象,统一兜底成 array 防消费方 .map 炸
  const resp = await api<OboGrant[] | { items?: OboGrant[] } | null>("obo/grants");
  if (Array.isArray(resp)) return resp;
  if (resp && typeof resp === "object" && Array.isArray((resp as { items?: OboGrant[] }).items)) {
    return (resp as { items: OboGrant[] }).items;
  }
  return [];
}

export interface CreateGrantPayload {
  grantee_bot_uid: string;
  mode: OboGrant["mode"];
  global_enabled: boolean;
  persona_prompt?: string;
  /** 后端要求显式 space_id(老仓走 X-Space-Id header,新仓后端把它移到 body 校验)。 */
  space_id?: string;
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
  // 同 listGrants:兜底成 array,防 `{items: [...]}` 包装 / null / 空对象时消费方 .map 炸
  const resp = await api<OboScope[] | { items?: OboScope[] } | null>(
    `obo/grants/${grantId}/scopes`,
  );
  if (Array.isArray(resp)) return resp;
  if (resp && typeof resp === "object" && Array.isArray((resp as { items?: OboScope[] }).items)) {
    return (resp as { items: OboScope[] }).items;
  }
  return [];
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
  /** space_bots 返:整个 space 的 bot 都有,modal 过滤 `creator_uid === myUid` 只留自己创建的。 */
  creator_uid?: string;
}

export async function listMyBots(spaceId?: string): Promise<BotCandidate[]> {
  // 对齐老仓:有 spaceId 就带 query;失败 / 非数组都兜底空(picker 不强依赖 my_bots)
  const resp = await api<BotCandidate[] | { items?: BotCandidate[] } | null>("robot/my_bots", {
    query: spaceId ? { space_id: spaceId } : undefined,
  });
  if (Array.isArray(resp)) return resp;
  if (
    resp &&
    typeof resp === "object" &&
    Array.isArray((resp as { items?: BotCandidate[] }).items)
  ) {
    return (resp as { items: BotCandidate[] }).items;
  }
  return [];
}

export async function listSpaceBots(spaceId: string): Promise<BotCandidate[]> {
  // 对齐老仓:space_bots **必带** space_id(后端 400 没带的请求);非数组兜底空
  const resp = await api<BotCandidate[] | { items?: BotCandidate[] } | null>("robot/space_bots", {
    query: { space_id: spaceId },
  });
  if (Array.isArray(resp)) return resp;
  if (
    resp &&
    typeof resp === "object" &&
    Array.isArray((resp as { items?: BotCandidate[] }).items)
  ) {
    return (resp as { items: BotCandidate[] }).items;
  }
  return [];
}
