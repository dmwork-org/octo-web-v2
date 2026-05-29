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
 * 创建群聊(对应旧 dmworkdatasource createChannel):
 *
 * POST /v1/group/create  body: { members: uids, space_id?, category_id? }
 *   → { group_no }
 *
 * uids 含 owner 自己;后端创建群,把所有 uid 加进去,owner 是当前调用者。
 * space_id 走 ofetch X-Space-Id 拦截器,这里也兜底显式传(对齐旧版)。
 * category_id 是分组 ID(可选);P3+ 接入分组系统时用。
 *
 * 注意 endpoint 是 `group/create`(单数 group + 动词 create),不是 RESTful
 * `POST /groups` — 后端历史路由,旧版 datasource 同款。
 */
export interface CreateGroupBody {
  members: string[];
  space_id?: string;
  category_id?: string;
}

export interface CreateGroupResp {
  group_no: string;
}

export async function createGroup(body: CreateGroupBody): Promise<CreateGroupResp> {
  return api<CreateGroupResp>("group/create", {
    method: "POST",
    body,
  });
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

/**
 * 子区管理 endpoint(对应旧 dmworkdatasource thread* 系列):
 *
 * - PUT    /v1/groups/{groupNo}/threads/{shortId}        改名(body { name })
 * - POST   /v1/threads/{shortId}/leave                   我离开子区
 * - DELETE /v1/groups/{groupNo}/threads/{shortId}        解散子区(owner only)
 * - GET    /v1/groups/{groupNo}/threads/{shortId}/md     子区公告 markdown
 * - PUT    /v1/groups/{groupNo}/threads/{shortId}/md     更新公告 → { version }
 * - DELETE /v1/groups/{groupNo}/threads/{shortId}/md     删除公告
 */

export async function updateThread(
  groupNo: string,
  shortId: string,
  body: { name: string },
): Promise<void> {
  await api(`groups/${encodeURIComponent(groupNo)}/threads/${encodeURIComponent(shortId)}`, {
    method: "PUT",
    body,
  });
}

export async function leaveThread(shortId: string): Promise<void> {
  await api(`threads/${encodeURIComponent(shortId)}/leave`, { method: "POST" });
}

export async function deleteThread(groupNo: string, shortId: string): Promise<void> {
  await api(`groups/${encodeURIComponent(groupNo)}/threads/${encodeURIComponent(shortId)}`, {
    method: "DELETE",
  });
}

export async function getThreadMd(groupNo: string, shortId: string): Promise<GroupMdContent> {
  return api<GroupMdContent>(
    `groups/${encodeURIComponent(groupNo)}/threads/${encodeURIComponent(shortId)}/md`,
  );
}

export async function updateThreadMd(
  groupNo: string,
  shortId: string,
  content: string,
): Promise<{ version: number }> {
  return api<{ version: number }>(
    `groups/${encodeURIComponent(groupNo)}/threads/${encodeURIComponent(shortId)}/md`,
    { method: "PUT", body: { content } },
  );
}

export async function deleteThreadMd(groupNo: string, shortId: string): Promise<void> {
  await api(`groups/${encodeURIComponent(groupNo)}/threads/${encodeURIComponent(shortId)}/md`, {
    method: "DELETE",
  });
}

/**
 * 群成员增删 / 管理员晋升降级(对应旧 dmworkdatasource/datasource.ts)。
 *
 * - POST /v1/groups/{groupNo}/members  body: { members: string[] }
 *   → 邀请加群(成员发现自己被加进群,有可能弹 ApproveGroupMember 申请确认)
 * - DELETE /v1/groups/{groupNo}/members  body: { members: string[] }
 *   → 踢人(只有 owner / manager 能调,后端按权限校验)
 * - POST /v1/groups/{groupNo}/managers  body: string[]   // 直接是 uids 数组!
 *   → 把若干普通成员晋升为管理员(只有 owner 能调)
 * - DELETE /v1/groups/{groupNo}/managers  body: string[] // 同上
 *   → 撤销管理员(只有 owner 能调)
 *
 * managers 端点 body 是 raw uids 数组(对齐旧 datasource 实现);members 端点 body
 * 是 { members: uids } 对象包装。后端这两套不一致是历史问题,新项目对齐保留。
 */

export async function addGroupMembers(groupNo: string, uids: string[]): Promise<void> {
  if (uids.length === 0) return;
  await api(`groups/${encodeURIComponent(groupNo)}/members`, {
    method: "POST",
    body: { members: uids },
  });
}

export async function removeGroupMembers(groupNo: string, uids: string[]): Promise<void> {
  if (uids.length === 0) return;
  await api(`groups/${encodeURIComponent(groupNo)}/members`, {
    method: "DELETE",
    body: { members: uids },
  });
}

export async function addGroupManagers(groupNo: string, uids: string[]): Promise<void> {
  if (uids.length === 0) return;
  await api(`groups/${encodeURIComponent(groupNo)}/managers`, {
    method: "POST",
    body: uids,
  });
}

export async function removeGroupManagers(groupNo: string, uids: string[]): Promise<void> {
  if (uids.length === 0) return;
  await api(`groups/${encodeURIComponent(groupNo)}/managers`, {
    method: "DELETE",
    body: uids,
  });
}

/**
 * 修改群字段(对应旧 dmworkdatasource updateField + ChannelField 枚举):
 *
 * PUT /v1/groups/{groupNo}  body: { name?, notice?, ... }
 *
 * 旧版 ChannelField 枚举仅包含 channelName(=name)/notice 两个用例,这里只透出
 * 这两个字段。其他场景(头像 url 等)走专门的 endpoint,本函数不混用。
 */
export interface UpdateGroupBody {
  name?: string;
  notice?: string;
}

export async function updateGroup(groupNo: string, body: UpdateGroupBody): Promise<void> {
  await api(`groups/${encodeURIComponent(groupNo)}`, {
    method: "PUT",
    body,
  });
}

/**
 * 修改群成员属性(对应旧 dmworkdatasource subscriberAttrUpdate):
 *
 * PUT /v1/groups/{groupNo}/members/{uid}  body: { name?, remark?, ... }
 *
 * 用例:改"我在本群的昵称"传 { name }(后端会把它存到 subscriber.remark 字段,
 * 旧版直接传 name,新项目对齐)。
 */
export interface UpdateGroupMemberBody {
  name?: string;
  remark?: string;
}

export async function updateGroupMember(
  groupNo: string,
  uid: string,
  body: UpdateGroupMemberBody,
): Promise<void> {
  await api(`groups/${encodeURIComponent(groupNo)}/members/${encodeURIComponent(uid)}`, {
    method: "PUT",
    body,
  });
}

/**
 * 群二维码(对应旧 dmworkdatasource qrcode):
 *
 * GET /v1/groups/{groupNo}/qrcode → { qrcode, expire, invite_url }
 *   - qrcode:扫码加群链接(也是二维码生成的 value)
 *   - expire:过期时间字符串(如 "2026-05-30 12:00:00")
 *   - invite_url:邀请链接(可复制粘贴),后端可能不返回此字段(老 API)→ fallback 用 qrcode
 *
 * 后端按 7 天有效期签发,过期需重新拉。
 */
export interface GroupQrcodeResp {
  qrcode: string;
  expire: string;
  invite_url?: string;
}

export async function getGroupQrcode(groupNo: string): Promise<GroupQrcodeResp> {
  return api<GroupQrcodeResp>(`groups/${encodeURIComponent(groupNo)}/qrcode`);
}

/**
 * 上传群头像(对应旧 ChannelAvatar.uploadAvatar):
 *
 * POST /v1/groups/{groupNo}/avatar  multipart/form-data  field: file
 *
 * 后端把图片存好后,channel.logo 会更新;前端调用方负责调
 * `WKSDK.shared().channelManager.fetchChannelInfo(channel)` 触发刷新。
 *
 * 不做 crop(crop 依赖图片处理库,后续 components/media 补)。前端直接传原图,
 * 大小由后端校验(通常 < 2MB / 5MB)。
 */
export async function uploadGroupAvatar(groupNo: string, file: File): Promise<void> {
  const fd = new FormData();
  fd.append("file", file);
  await api(`groups/${encodeURIComponent(groupNo)}/avatar`, {
    method: "POST",
    body: fd,
  });
}

/**
 * GROUP.md 编辑器(对应旧 dmworkdatasource getGroupMd / updateGroupMd / deleteGroupMd):
 *
 * - GET    /v1/groups/{groupNo}/md → { content, version }
 * - PUT    /v1/groups/{groupNo}/md body: { content }  resp: { version }
 * - DELETE /v1/groups/{groupNo}/md
 *
 * 子区(thread)的 md endpoint 在 `groups/{groupNo}/threads/{shortId}/md`,本期
 * 仅做群级,子区版本后续补。
 *
 * version 是后端递增计数,UI 用来显示 v{n}。
 */
export interface GroupMdContent {
  content: string;
  version: number;
}

export async function getGroupMd(groupNo: string): Promise<GroupMdContent> {
  return api<GroupMdContent>(`groups/${encodeURIComponent(groupNo)}/md`);
}

export async function updateGroupMd(
  groupNo: string,
  content: string,
): Promise<{ version: number }> {
  return api<{ version: number }>(`groups/${encodeURIComponent(groupNo)}/md`, {
    method: "PUT",
    body: { content },
  });
}

export async function deleteGroupMd(groupNo: string): Promise<void> {
  await api(`groups/${encodeURIComponent(groupNo)}/md`, { method: "DELETE" });
}

/**
 * Bot 管理员(对应旧 setBotAdmin / removeBotAdmin):
 *
 * - PUT    /v1/groups/{groupNo}/bot_admin/{uid}
 * - DELETE /v1/groups/{groupNo}/bot_admin/{uid}
 *
 * 一个群里的 bot 成员可以被 owner 任命为 bot 管理员(代理 owner 管理 bot 配置),
 * subscriber.orgData.bot_admin === 1 表示已任命。
 */
export async function setGroupBotAdmin(groupNo: string, uid: string): Promise<void> {
  await api(`groups/${encodeURIComponent(groupNo)}/bot_admin/${encodeURIComponent(uid)}`, {
    method: "PUT",
  });
}

export async function removeGroupBotAdmin(groupNo: string, uid: string): Promise<void> {
  await api(`groups/${encodeURIComponent(groupNo)}/bot_admin/${encodeURIComponent(uid)}`, {
    method: "DELETE",
  });
}

/**
 * 群下的子区列表(对应旧 dmworkdatasource threadList):
 * GET /v1/groups/{groupNo}/threads?page_index&page_size → { list: ThreadRaw[] }
 *
 * 用于 chat-header 子区按钮弹出的子区面板列表。
 */
export interface ThreadListParams {
  page_index?: number;
  page_size?: number;
}

export async function listThreads(
  groupNo: string,
  params?: ThreadListParams,
): Promise<ThreadRaw[]> {
  const resp = await api<{ list?: ThreadRaw[] }>(`groups/${encodeURIComponent(groupNo)}/threads`, {
    query: params,
  });
  return resp?.list ?? [];
}

/** 加入子区(对应旧 dmworkdatasource threadJoin)— POST /v1/threads/{shortId}/join */
export async function joinThread(shortId: string): Promise<void> {
  await api(`threads/${encodeURIComponent(shortId)}/join`, { method: "POST" });
}

/** 归档子区(旧 threadArchive)— POST /v1/groups/{groupNo}/threads/{shortId}/archive。 */
export async function archiveThread(groupNo: string, shortId: string): Promise<void> {
  await api(
    `groups/${encodeURIComponent(groupNo)}/threads/${encodeURIComponent(shortId)}/archive`,
    { method: "POST" },
  );
}

/**
 * 创建子区(无 sourceMessage 时,顶部 + 按钮入口)。旧 dmworkdatasource
 * threadCreate(groupNo, name, sourceMessageId?)— sourceMessageId 可选。
 * 区别于 createThread(POST + 必传 source_message_id),本签名简化为 name only。
 */
export async function createThreadByName(groupNo: string, name: string): Promise<ThreadRaw> {
  return api<ThreadRaw>(`groups/${encodeURIComponent(groupNo)}/threads`, {
    method: "POST",
    body: { name },
  });
}
