import { api } from "@/features/base/api/client";

/**
 * Group(群聊)相关 endpoints。
 *
 * - GET /v1/group/my?space_id=  → 我加入的群列表(当前 Space 维度)
 * - GET /v1/groups/{groupNo}/membersync — 群成员增量同步(version + limit)
 * - POST /v1/groups/{groupNo}/threads  — 从消息创建子区
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
 * 群成员增量同步(对应旧 dmworkdatasource/module.ts::syncSubscribersCallback)。
 *
 * GET /v1/groups/{groupNo}/membersync?version={ver}&limit={n}
 *
 * 后端按 version 增量返回(version=0 = 首次全量)。version 由 SDK SubscriberManager
 * 自管,业务层拿到 raw 后转 SDK Subscriber 即可。limit 默认 10000(对齐旧版,
 * 群成员通常不会超过)。
 *
 * 子区(ChannelTypeCommunityTopic)的成员就是父群的成员,调用方负责把子区 channelID
 * parse 出 parentGroupNo 后传进来,本函数不感知 channelType。
 */

export interface GroupMemberRaw {
  uid: string;
  name?: string;
  remark?: string;
  role?: number; // 0 normal / 1 owner / 2 manager
  version?: number;
  is_deleted?: number;
  status?: number;
  bot_admin?: number;
  robot?: number; // 1 → AI bot
  [key: string]: unknown; // 保留其他字段透传给 Subscriber.orgData
}

export async function syncGroupMembers(
  groupNo: string,
  version: number,
  limit = 10000,
): Promise<GroupMemberRaw[]> {
  const resp = await api<GroupMemberRaw[]>(`groups/${encodeURIComponent(groupNo)}/membersync`, {
    query: { version, limit },
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

/**
 * 子区(thread)详情(对应旧 datasource.ts::threadGet)。
 *
 * GET /v1/groups/{groupNo}/threads/{shortId}
 *
 * channelInfoCallback 在 channel.channelType === ChannelTypeCommunityTopic 时调用,
 * 用来填充子区 channel 的 title / orgData.thread / mute / has_thread_md 等字段。
 *
 * mute tri-state:null = 未设置(继承父群);0 = 显式不静音;1 = 显式静音。
 */
export interface ThreadRaw {
  short_id: string;
  name: string;
  creator_uid?: string;
  creator_name?: string;
  source_message_id?: number | string;
  status?: number;
  created_at?: string;
  updated_at?: string;
  is_member?: number;
  member_count?: number;
  message_count?: number;
  unread_count?: number;
  last_message_content?: string;
  last_message_sender_name?: string;
  has_thread_md?: number | boolean;
  thread_md_version?: number;
  thread_md_updated_at?: string | null;
  group_name?: string;
  last_message_at?: string;
  mute?: number | null; // tri-state
}

export async function getThread(groupNo: string, shortId: string): Promise<ThreadRaw> {
  return api<ThreadRaw>(
    `groups/${encodeURIComponent(groupNo)}/threads/${encodeURIComponent(shortId)}`,
  );
}
