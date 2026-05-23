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
}

export interface SyncConversationsResp {
  conversations?: ConversationRaw[];
  users?: unknown[];
  groups?: unknown[];
}

export async function syncConversations(spaceId?: string): Promise<SyncConversationsResp> {
  const url = spaceId
    ? `conversation/sync?space_id=${encodeURIComponent(spaceId)}`
    : "conversation/sync";
  return api<SyncConversationsResp>(url, { method: "POST", body: { msg_count: 1 } });
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

export async function syncChannelMessages(req: SyncMessagesReq): Promise<SyncMessagesResp> {
  return api<SyncMessagesResp>("message/channel/sync", { method: "POST", body: req });
}
