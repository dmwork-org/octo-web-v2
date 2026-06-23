import { api } from "@/features/base/api/client";

/**
 * IM 会话同步(对应旧项目 `dmworkdatasource/conversation.ts::syncConversationsCallback`)。
 *
 * POST /v1/conversation/sync (可选 ?space_id=)
 * Body: { msg_count: 1 }
 * Resp: {
 *   conversations: ConversationRaw[],
 *   users?: UserRaw[],
 *   groups?: GroupRaw[],
 * }
 *
 * 返回 raw 对象,由 IMProvider 内 callback 转 SDK Conversation/ChannelInfo 实例。
 */

export interface ConversationRaw {
  channel_id: string;
  channel_type: number;
  unread?: number;
  timestamp?: number;
  stick?: number;
  category_id?: string | null;
  category_sort?: number;
  space_unread?: number;
  recents?: unknown[];
  extra?: unknown;
  space_id?: string;
}

/** sync 响应里的 user 项(用于 channelInfo 缓存预热)。 */
export interface SyncedUserRaw {
  uid: string;
  name?: string;
  remark?: string;
  mute?: number;
  top?: number;
  online?: number;
  last_offline?: number;
  logo?: string;
  category?: string;
  short_no?: string;
  realname_verified?: boolean | number;
  real_name?: string;
  extra?: Record<string, unknown>;
  [key: string]: unknown;
}

/** sync 响应里的 group 项。 */
export interface SyncedGroupRaw {
  group_no: string;
  name?: string;
  remark?: string;
  mute?: number;
  top?: number;
  online?: number;
  last_offline?: number;
  logo?: string;
  forbidden?: number;
  invite?: number;
  forbidden_add_friend?: number;
  save?: number;
  extra?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface SyncConversationsResp {
  conversations?: ConversationRaw[];
  users?: SyncedUserRaw[];
  groups?: SyncedGroupRaw[];
}

export async function syncConversations(spaceId?: string): Promise<SyncConversationsResp> {
  const url = spaceId
    ? `conversation/sync?space_id=${encodeURIComponent(spaceId)}`
    : "conversation/sync";
  // recent_filter: true(对齐上游 1286d289 / #303)— 让后端按"最近"语义返
  // 会话列表(过滤 N 天不活跃群等),前端不再做 3 天硬编码过滤(配合 f85ba4d0)。
  return api<SyncConversationsResp>(url, {
    method: "POST",
    body: { msg_count: 1, recent_filter: true },
  });
}

/**
 * 单会话历史消息同步(对应旧项目 `dmworkdatasource/conversation.ts::syncGetMessages`)。
 *
 * POST /v1/message/channel/sync
 * Body: { channel_id, channel_type, start_message_seq, end_message_seq, limit, pull_mode }
 * Resp: { messages: MessageRaw[] }
 *
 * 直接调本端点而非走 SDK chatManager.syncMessages — 旧项目也是这个模式
 * (绕过 SDK 自己包装 ConversationProvider)。
 */

export interface SyncMessagesReq {
  channel_id: string;
  channel_type: number;
  start_message_seq: number;
  end_message_seq: number;
  limit: number;
  pull_mode: number;
}

export interface MessageExtraRaw {
  message_id?: number | string;
  message_id_str?: string;
  message_seq?: number;
  readed?: number;
  readed_at?: number;
  readed_count?: number;
  unread_count?: number;
  revoke?: number;
  revoker?: string;
  extra_version?: number;
  edited_at?: number;
  content_edit?: { type?: number } & Record<string, unknown>;
  is_edit?: number;
  extra?: unknown;
}

export interface MessageRaw {
  message_id?: string | number;
  message_idstr?: string;
  message_seq?: number;
  client_seq?: number;
  client_msg_no?: string;
  channel_id: string;
  channel_type: number;
  from_uid: string;
  timestamp: number;
  payload?: unknown;
  setting?: number;
  header?: { red_dot?: number };
  revoke?: number;
  is_deleted?: number;
  message_extra?: MessageExtraRaw;
  // 外部群成员消息来源字段(dmwork-web#1069)
  from_is_external?: number;
  from_source_space_name?: string;
  from_home_space_id?: string;
  from_home_space_name?: string;
}

export interface SyncMessagesResp {
  messages?: MessageRaw[];
}

export async function syncChannelMessages(
  req: SyncMessagesReq,
  options?: { noSpaceFilter?: boolean },
): Promise<SyncMessagesResp> {
  return api<SyncMessagesResp>("message/channel/sync", {
    method: "POST",
    body: req,
    // noSpaceFilter: 跳过 X-Space-Id 注入(issue #161),用于 SYSTEM_BOTS
    // (BotFather)的全局历史拉取 — 后端按 Space 过滤会截断为仅当前 Space 消息,
    // 导致分页提前终止。前端在 display 层用 isMessageOfSpace 做客户端过滤。
    headers: options?.noSpaceFilter ? { "X-No-Space-Filter": "1" } : undefined,
  });
}

/**
 * 清空会话未读数(对应旧 dmworkdatasource/conversation.ts::markConversationUnread)。
 *
 * PUT /v1/conversation/clearUnread { channel_id, channel_type, unread:0 }
 *
 * 进入会话视图时调一次,服务端会同步给其他端 + 把会话 unread 置 0。
 */
export async function clearConversationUnread(args: {
  channelId: string;
  channelType: number;
  unread?: number;
}): Promise<void> {
  await api("conversation/clearUnread", {
    method: "PUT",
    body: {
      channel_id: args.channelId,
      channel_type: args.channelType,
      unread: args.unread && args.unread > 0 ? args.unread : 0,
    },
  });
}

/**
 * 标记消息已读(对应旧 dmworkdatasource/module.ts::messageReadedCallback)。
 *
 * POST /v1/message/readed { channel_id, channel_type, message_ids }
 *
 * SDK 内部 chatManager 会把可视消息攒成批,通过 messageReadedCallback 调本端点。
 * 服务端再触发对方端的 messageExtra readed_count 增量同步。
 */
export async function markMessagesReaded(args: {
  channelId: string;
  channelType: number;
  messageIds: string[];
}): Promise<void> {
  if (!args.messageIds.length) return;
  await api("message/readed", {
    method: "POST",
    body: {
      channel_id: args.channelId,
      channel_type: args.channelType,
      message_ids: args.messageIds,
    },
  });
}

/**
 * 关闭/删除会话(对应旧 ConversationProvider::deleteConversation)。
 * DELETE /v1/conversations/{channelID}/{channelType}
 *
 * 服务端把这条会话从我端 sync 列表中移除(其他端不受影响)。
 * 旧版"关闭聊天窗口"右键 + Bot 重置 / 会话清理流程都走这里。
 */
export async function deleteConversation(args: {
  channelId: string;
  channelType: number;
}): Promise<void> {
  await api(`conversations/${encodeURIComponent(args.channelId)}/${args.channelType}`, {
    method: "DELETE",
  });
}

/**
 * 清空指定 channel 的聊天记录(对应旧 ConversationProvider::clearConversationMessages)。
 * POST /v1/message/offset { channel_id, channel_type, message_seq }
 *
 * 后端把 channel 内 message_seq <= 入参的消息从我视角"切掉",其他端不受影响。
 * 入参通常传 lastMessage.messageSeq,意为"清空到当前最新一条之前"。
 */
export async function clearChannelMessages(args: {
  channelId: string;
  channelType: number;
  messageSeq: number;
}): Promise<void> {
  await api("message/offset", {
    method: "POST",
    body: {
      channel_id: args.channelId,
      channel_type: args.channelType,
      message_seq: args.messageSeq,
    },
  });
}

/**
 * Conversation extras 增量同步(对应旧 dmworkdatasource/module.ts::syncConversationExtrasCallback)。
 *
 * POST /v1/conversation/extra/sync { version }
 *
 * 后端按 extras 表的全局 version 增量返回 — extras 含 keep_msg_seq / draft / browse_to
 * 等"端到端跨设备同步"的会话级元数据。SDK ConversationManager 收到后写回每个
 * Conversation.extra,触发 listener。版本号由 SDK 自管。
 */

export interface ConversationExtraRaw {
  channel_id: string;
  channel_type: number;
  browse_to?: number;
  keep_message_seq?: number;
  keep_offset_y?: number;
  draft?: string;
  draft_updated_at?: number;
  version?: number;
}

export async function syncConversationExtras(version: number): Promise<ConversationExtraRaw[]> {
  const resp = await api<ConversationExtraRaw[] | null>("conversation/extra/sync", {
    method: "POST",
    body: { version },
  });
  return resp ?? [];
}

/**
 * Message extras 增量同步(对应旧 ConversationProvider::syncMessageExtras)。
 *
 * POST /v1/message/extra/sync { channel_id, channel_type, extra_version, limit }
 *
 * 后端按消息 extras 版本号返回增量(已读数 / 撤回 / 编辑等元数据变化),SDK 拿到后
 * 写回 Message.remoteExtra,触发消息列表 listener。
 */

export interface SyncMessageExtrasReq {
  channel_id: string;
  channel_type: number;
  extra_version: number;
  limit: number;
}

export async function syncMessageExtras(req: SyncMessageExtrasReq): Promise<MessageExtraRaw[]> {
  const resp = await api<MessageExtraRaw[] | null>("message/extra/sync", {
    method: "POST",
    body: req,
  });
  return resp ?? [];
}
