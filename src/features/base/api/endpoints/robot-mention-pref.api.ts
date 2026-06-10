import { api } from "@/features/base/api/client";

/**
 * Bot 群级免@回答偏好(对应 octo-server `modules/robot/mention_pref.go`)。
 *
 * **背景**:bot 主人可以在某群关掉"必须 @ 才回答",让 bot 自动应答全部消息。
 * 群管理员侧的 `allow_no_mention` 总开关在 batch 1.6 已搬(group-management-modal)。
 * 这里管的是 bot 主人侧的 `no_mention` 维度。
 *
 *   最终免at = bot主人开了本群免at(no_mention) AND 群管理员允许本群免at(allow_no_mention)
 */

export interface RobotGroupItem {
  group_no: string;
  name: string;
  /** bot 主人在该群是否开了免@(true=自动应答全部消息) */
  no_mention: boolean;
  /** 群管理员是否允许免@(false 时 bot 主人开了也无效) */
  group_allow_no_mention: boolean;
}

export interface RobotGroupListResp {
  list: RobotGroupItem[];
  next_cursor: string | null;
  has_more: boolean;
}

/**
 * GET /v1/robot/:robot_id/groups?limit=30&cursor=<opaque>&q=<可选>
 * 列 bot 所在的群(分页 + 可选搜索)。
 */
export async function listRobotGroups(params: {
  robotId: string;
  limit?: number;
  cursor?: string | null;
  q?: string;
}): Promise<RobotGroupListResp> {
  const query: Record<string, string | number> = {};
  if (params.limit) query.limit = params.limit;
  if (params.cursor) query.cursor = params.cursor;
  if (params.q) query.q = params.q;
  return api<RobotGroupListResp>(`robot/${encodeURIComponent(params.robotId)}/groups`, {
    method: "GET",
    params: query,
  });
}

/**
 * PUT /v1/robot/:robot_id/groups/:group_no/mention_pref
 * 设置 bot 在该群是否免@回答。
 */
export async function setRobotMentionPref(
  robotId: string,
  groupNo: string,
  noMention: boolean,
): Promise<void> {
  await api(
    `robot/${encodeURIComponent(robotId)}/groups/${encodeURIComponent(groupNo)}/mention_pref`,
    {
      method: "PUT",
      body: { no_mention: noMention ? 1 : 0 },
    },
  );
}

/**
 * DELETE /v1/robot/:robot_id/groups/:group_no/mention_pref
 * 清除该群的偏好,回退账号级默认(no_mention=0)。
 */
export async function deleteRobotMentionPref(robotId: string, groupNo: string): Promise<void> {
  await api(
    `robot/${encodeURIComponent(robotId)}/groups/${encodeURIComponent(groupNo)}/mention_pref`,
    { method: "DELETE" },
  );
}
