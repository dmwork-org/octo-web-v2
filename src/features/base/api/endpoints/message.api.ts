import { api } from "@/features/base/api/client";
import type { Channel } from "wukongimjssdk";

/**
 * 撤回消息(对应旧 dmworkdatasource/conversation.ts::revokeMessage)。
 *
 * POST /v1/message/revoke?channel_id=...&channel_type=...&message_id=...&client_msg_no=...
 *
 * 服务端处理后通过 IM CMD `messageRevoke` 推送给各端,
 * use-cmd-sync hook 内 cmdListener 接收后把对应 message.remoteExtra.revoke=true。
 */
export async function revokeMessage(args: {
  channel: Channel;
  messageId: string;
  clientMsgNo: string;
}): Promise<void> {
  const params = new URLSearchParams({
    channel_id: args.channel.channelID,
    channel_type: String(args.channel.channelType),
    message_id: args.messageId,
    client_msg_no: args.clientMsgNo,
  });
  await api(`message/revoke?${params.toString()}`, { method: "POST" });
}

/**
 * 消息回应(reactions)— P2-B9 后端 API,UI 等 P3-C8 ContextMenus。
 *
 * POST /v1/reactions { message_id, channel_id, channel_type, emoji }
 *   → 同 uid 重复发同 emoji = 取消;不同 emoji = 替换。
 *
 * POST /v1/reaction/sync { channel_id, channel_type, seq, limit }
 *   → 返回 { uid, name, message_id, emoji, seq, created_at, is_deleted }[]
 *   由客户端按 message_id 聚合成 SDK Reaction { emoji, count, users }。
 *
 * 旧 octo-web 未启用 reactions UI(PopupMenus 代码注释),新项目机器侧先备齐,
 * P3-C8 接 ContextMenus 时再渲染长按表情条 + 气泡下计数聚合。
 */
export async function toggleReaction(args: {
  messageId: string;
  channel: Channel;
  emoji: string;
}): Promise<void> {
  await api("reactions", {
    method: "POST",
    body: {
      message_id: args.messageId,
      channel_id: args.channel.channelID,
      channel_type: args.channel.channelType,
      emoji: args.emoji,
    },
  });
}

export interface ReactionRaw {
  uid: string;
  name: string;
  channel_id: string;
  channel_type: number;
  seq: number;
  message_id: string;
  emoji: string;
  created_at?: string;
  is_deleted?: number;
}

export async function syncReactions(args: {
  channel: Channel;
  seq?: number;
  limit?: number;
}): Promise<ReactionRaw[]> {
  const resp = await api<ReactionRaw[]>("reaction/sync", {
    method: "POST",
    body: {
      channel_id: args.channel.channelID,
      channel_type: args.channel.channelType,
      seq: args.seq ?? 0,
      limit: args.limit ?? 200,
    },
  });
  return resp ?? [];
}

/**
 * 批量删除消息(对应旧 dmworkdatasource/conversation.ts::deleteMessages)。
 * DELETE /v1/message body: [{ message_id, channel_id, channel_type, message_seq }]
 *
 * 注意:DELETE 带 body 是旧 API 的特殊设计;ofetch 支持(method+body 同时存在)。
 */
export interface DeleteMessageItem {
  message_id: string;
  channel_id: string;
  channel_type: number;
  message_seq: number;
}

export async function deleteMessages(items: DeleteMessageItem[]): Promise<void> {
  if (items.length === 0) return;
  await api("message", { method: "DELETE", body: items });
}
