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
