import { api } from "@/features/base/api/client";

/**
 * Group(群聊)相关 endpoints。
 *
 * - GET /v1/group/my?space_id=  → 我加入的群列表(当前 Space 维度)
 */

export interface GroupSummary {
  group_no: string;
  name: string;
  avatar?: string;
  member_count?: number;
  creator?: string;
  category?: string;
  notice?: string;
  created_at?: string;
}

export async function getMyGroups(spaceId: string): Promise<GroupSummary[]> {
  const resp = await api<GroupSummary[]>("group/my", {
    query: { space_id: spaceId },
  });
  return resp ?? [];
}
