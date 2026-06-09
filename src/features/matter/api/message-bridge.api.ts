import { api } from "@/features/base/api/client";
import { CHANNEL_TYPE_GROUP, CHANNEL_TYPE_THREAD } from "@/features/matter/types/matter.types";

/** 单条 IM 消息响应 */
export interface IMMessageResp {
  message_id: number;
  message_idstr: string;
  from_uid: string;
  channel_id: string;
  channel_type: number;
  timestamp: number;
  payload: Record<string, unknown>;
}

/**
 * 从 channel_id 解析父群 groupNo 和子区 threadId。
 * - 普通群(channelType= CHANNEL_TYPE_GROUP):channel_id 即 groupNo。
 * - 子区(channelType=CHANNEL_TYPE_THREAD):channel_id 格式为 "parentGroupNo__threadId"。
 * - 非群/非子区返回 null（不支持查看上下文）。
 */
function parseChannelForMessage(
  channelId: string,
  channelType: number,
): { groupNo: string; threadId?: string } | null {
  if (channelType === CHANNEL_TYPE_GROUP) {
    return { groupNo: channelId };
  }
  if (channelType === CHANNEL_TYPE_THREAD) {
    const parts = channelId.split("__");
    if (parts.length >= 2) {
      return { groupNo: parts[0], threadId: parts.slice(1).join("__") };
    }
  }
  return null;
}

/** 按 message_id 查询单条消息 */
export async function getMessage(
  channelId: string,
  channelType: number,
  messageId: string,
): Promise<IMMessageResp> {
  const parsed = parseChannelForMessage(channelId, channelType);
  if (!parsed) {
    throw new Error(`不支持的消息类型: channelType=${channelType}`);
  }
  const { groupNo, threadId } = parsed;
  const segGroup = encodeURIComponent(groupNo);
  const segMsg = encodeURIComponent(messageId);
  const path = threadId
    ? `groups/${segGroup}/threads/${encodeURIComponent(threadId)}/messages/${segMsg}`
    : `groups/${segGroup}/messages/${segMsg}`;

  return api<IMMessageResp>(path, { method: "GET" });
}

/** 批量查询多条消息（容错：单条失败不影响其余） */
export async function getMessages(
  channelId: string,
  channelType: number,
  messageIds: string[],
): Promise<IMMessageResp[]> {
  const results = await Promise.allSettled(
    messageIds.map((id) => getMessage(channelId, channelType, id)),
  );
  return results
    .filter((r): r is PromiseFulfilledResult<IMMessageResp> => r.status === "fulfilled")
    .map((r) => r.value);
}
