import { api } from "@/features/base/api/client";
import type { Channel } from "wukongimjssdk";

/**
 * 撤回消息(对应旧 dmworkdatasource/conversation.ts::revokeMessage)。
 *
 * POST /v1/message/revoke?channel_id=...&channel_type=...&message_id=...&client_msg_no=...
 *
 * 服务端处理后通过 IM CMD `messageRevoke` 推送给各端,
 * use-messages-sync hook 内 cmdListener 接收后把对应 message.remoteExtra.revoke=true。
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
