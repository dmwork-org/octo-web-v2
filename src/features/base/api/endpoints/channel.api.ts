import { api } from "@/features/base/api/client";

/**
 * Channel 元信息(对应旧项目 `dmworkdatasource/module.ts::setChannelInfoCallback`)。
 *
 * GET /v1/channels/{realUID}/{channelType}
 * Resp 字段(精选,P2 必需):
 *   channel: { channel_id, channel_type }
 *   name: string                   ← 标题
 *   logo?: string                  ← 头像 URL
 *   remark?: string                ← 备注名
 *   mute?: 0|1
 *   stick?: 0|1
 *   online?: 0|1
 *   last_offline?: number
 *   extra?: Record<string, unknown>
 *   ...大量业务字段(robot/follow/status/...)
 */

export interface ChannelInfoRaw {
  channel: { channel_id: string; channel_type: number };
  name?: string;
  logo?: string;
  remark?: string;
  mute?: number;
  stick?: number;
  online?: number;
  last_offline?: number;
  notice?: string;
  extra?: Record<string, unknown>;
  // 业务字段(后端透传,大部分可选;im-callbacks 兜底解析)
  robot?: number;
  receipt?: number;
  status?: number;
  follow?: number;
  category?: string;
  be_deleted?: number;
  be_blacklist?: number;
  forbidden?: number;
  invite?: number;
  save?: number;
  has_group_md?: number | boolean;
  group_md_version?: number;
  group_md_updated_at?: string | null;
  can_edit_group_md?: number | boolean;
  can_manage_bot_admin?: number | boolean;
  // Space 归属(后端透传;im-callbacks 构造 orgData 时存到 orgData.space_id,
  // 给 isChannelOfSpace 第 2 层 fallback 用,实现跨 Space 渗漏防护)
  space_id?: string;
}

export async function getChannelInfoRaw(
  channelId: string,
  channelType: number,
): Promise<ChannelInfoRaw> {
  return api<ChannelInfoRaw>(`channels/${channelId}/${channelType}`);
}
