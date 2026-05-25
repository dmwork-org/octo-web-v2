import { api } from "@/features/base/api/client";
import { spaceStore } from "@/features/base/stores/space";

/**
 * 全局搜索(对应旧 dmworkbase Components/GlobalSearch/vm::requestSearch):
 *
 * POST /v1/search/global?space_id={?}
 * body: { keyword, page, limit, content_type, channel_id?, channel_type?, only_message? }
 *
 * 响应三段(任一可能为空数组):
 *   friends:  匹配的联系人(channel_id 即 uid,channel_type=1)
 *   groups:   匹配的群组
 *   messages: 匹配的消息(payload 是原 SDK content encode 后的 JSON)
 *
 * 后端在 name/digest 字段里把匹配的关键字包成 `<mark>xxx</mark>`,
 * 前端用 sanitizeHighlight 安全渲染(只允许 mark 标签)。
 */

export interface SearchChannel {
  channel_id: string;
  channel_name: string;
  channel_type: number;
  channel_remark?: string;
  channel_avatar?: string;
}

export interface SearchFriend {
  channel_id: string;
  channel_name: string;
  channel_remark?: string;
  channel_avatar?: string;
  robot?: number;
  source_space_name?: string;
  home_space_name?: string;
}

export interface SearchGroup {
  channel_id: string;
  channel_name: string;
  channel_remark?: string;
  channel_avatar?: string;
  member_count?: number;
}

export interface SearchMessage {
  from_uid: string;
  from_name?: string;
  message_id?: string;
  message_seq?: number;
  timestamp?: number;
  payload?: Record<string, unknown> & { type?: number };
  /** 后端可能给的简略 digest(替 content_type 各类) */
  conversationDigest?: string;
  channel: SearchChannel;
}

export interface SearchGlobalResp {
  friends?: SearchFriend[];
  groups?: SearchGroup[];
  messages?: SearchMessage[];
}

export interface SearchGlobalParams {
  keyword: string;
  page?: number;
  limit?: number;
  /** 消息内容类型 filter,文件 tab 传 [MessageContentType.file];联系人/群 tab 传 [] */
  contentType?: number[];
  /** Channel 内搜索 */
  channelId?: string;
  channelType?: number;
  /** only_message=1 时不返 friends/groups,只返 messages */
  onlyMessage?: boolean;
}

export async function searchGlobal(params: SearchGlobalParams): Promise<SearchGlobalResp> {
  const spaceId = spaceStore.state.spaceId ?? undefined;
  const query = spaceId ? { space_id: spaceId } : undefined;
  const body: Record<string, unknown> = {
    keyword: params.keyword ?? "",
    page: params.page ?? 1,
    limit: params.limit ?? 20,
    content_type: params.contentType ?? [],
  };
  if (params.channelId) {
    body.channel_id = params.channelId;
    body.channel_type = params.channelType;
  }
  if (params.onlyMessage) {
    body.only_message = 1;
  }
  return api<SearchGlobalResp>("search/global", { method: "POST", query, body });
}
