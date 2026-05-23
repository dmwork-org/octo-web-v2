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
