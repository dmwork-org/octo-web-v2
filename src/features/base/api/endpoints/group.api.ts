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

/**
 * 从群消息创建子区(对应旧 module.tsx contextmenus.createThread):
 *
 * POST /v1/groups/{groupNo}/threads
 *   body: { name, source_message_id, source_message_payload }
 *   resp: { channel_id }(子区 channelID,channelType=7 ChannelTypeCommunityTopic)
 *
 * source_message_payload 是原消息 content 的 encode 形式 + type 字段,后端用它
 * 渲染子区"基于此消息创建"的卡片。
 */
export interface CreateThreadReq {
  name: string;
  source_message_id: number;
  source_message_payload: Record<string, unknown>;
}

export interface CreateThreadResp {
  channel_id: string;
}

export async function createThread(
  groupNo: string,
  req: CreateThreadReq,
): Promise<CreateThreadResp> {
  return api<CreateThreadResp>(`groups/${encodeURIComponent(groupNo)}/threads`, {
    method: "POST",
    body: req,
  });
}
