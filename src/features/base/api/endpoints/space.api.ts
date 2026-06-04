import { api } from "@/features/base/api/client";

/**
 * 我的空间列表(对应旧项目 SpaceService 列表数据源)。
 *
 * GET /v1/space/my → SpaceResp[]
 */

export interface SpaceResp {
  space_id: string;
  name: string;
  description?: string;
  logo?: string;
  creator?: string;
  status?: number;
  role?: number;
  max_users?: number;
  member_count?: number;
  join_mode?: number;
  created_at?: string;
  updated_at?: string;
}

export async function getMySpaces(): Promise<SpaceResp[]> {
  const resp = await api<SpaceResp[]>("space/my");
  return resp ?? [];
}

/**
 * Space 成员(人 + AI 混合,robot=0/1 区分)。
 * GET /v1/space/{spaceId}/members?page=&limit=
 */

export interface SpaceMember {
  uid: string;
  name: string;
  avatar?: string;
  role: number; // 1: owner, 2: admin, 3: member
  robot: number; // 0: user, 1: bot
  created_at?: string;
}

export async function getSpaceMembers(
  spaceId: string,
  page = 1,
  limit = 10000,
): Promise<SpaceMember[]> {
  const resp = await api<SpaceMember[]>(`space/${spaceId}/members`, {
    query: { page, limit },
  });
  return resp ?? [];
}

// ---------------------------------------------------------------------------
// Space 管理 API(对应老仓 SpaceService 的 join / create / invite / leave /
// dismiss / member role / 编辑空间)。Members 列表上面已有,这里追加写操作。
// ---------------------------------------------------------------------------

/** 邀请信息(校验邀请码;不验证不入参的话仅显示 banner)。 */
export interface SpaceInviteInfo {
  space_id: string;
  space_name: string;
  member_count?: number;
  max_users?: number;
  invite_code: string;
  /** 0=直接加入 / 1=审批加入(对齐老仓 join_mode 语义)。 */
  join_mode?: number;
}
export async function getInviteInfo(inviteCode: string): Promise<SpaceInviteInfo> {
  return api<SpaceInviteInfo>(`space/invite/${inviteCode}`);
}

/** 加入空间(direct 或 审批,后者返 pending,接听 join approval hook)。 */
export async function joinSpace(inviteCode: string): Promise<{ status?: number }> {
  return api(`space/join`, { method: "POST", body: { invite_code: inviteCode } });
}

/** 创建空间(name 32 限,description 200 限,join_mode 0/1 由 UI 控制)。 */
export interface CreateSpacePayload {
  name: string;
  description?: string;
  join_mode?: number;
}
export async function createSpace(payload: CreateSpacePayload): Promise<SpaceResp> {
  return api<SpaceResp>("space/create", { method: "POST", body: payload });
}

/** 编辑空间名 / 描述(owner / admin)。 */
export async function updateSpace(
  spaceId: string,
  payload: Partial<Pick<SpaceResp, "name" | "description" | "join_mode" | "logo">>,
): Promise<void> {
  await api(`space/${spaceId}`, { method: "PUT", body: payload });
}

/** 生成邀请码。 */
export interface InviteCodeResp {
  invite_code: string;
  expire_at?: number;
}
export async function generateInviteCode(spaceId: string): Promise<InviteCodeResp> {
  return api<InviteCodeResp>(`space/${spaceId}/invite`, { method: "POST" });
}

/** 离开空间(普通成员 / admin)。 */
export async function leaveSpace(spaceId: string): Promise<void> {
  await api(`space/${spaceId}/leave`, { method: "POST" });
}

/** 解散空间(owner only)。 */
export async function dismissSpace(spaceId: string): Promise<void> {
  await api(`space/${spaceId}`, { method: "DELETE" });
}

/** 更新成员角色(2=admin / 3=member;1=owner 后端拒)。 */
export async function updateMemberRole(spaceId: string, uid: string, role: number): Promise<void> {
  await api(`space/${spaceId}/members/${uid}/role`, { method: "PUT", body: { role } });
}

/** 移除成员(批量;owner uid 后端拒)。 */
export async function removeMembers(spaceId: string, uids: string[]): Promise<void> {
  await api(`space/${spaceId}/members`, { method: "DELETE", body: { uids } });
}
