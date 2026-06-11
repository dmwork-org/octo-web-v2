/**
 * Channel ID 工具: 处理父群 / 子区 ID 的拆解。
 *
 * WuKongIM 子区 (channel_type=5, CommunityTopic) 的 channel_id 是
 * "{父群 group_no}____{子区 short_id}" 拼接字符串。
 */

const THREAD_CHANNEL_ID_SEPARATOR = "____";
const CHANNEL_TYPE_COMMUNITY_TOPIC = 5;

/**
 * 把 (channel_id, channel_type) 归一成 "父群号"。
 *
 * - 子区 (channel_type=5): 拆 '____' 取前半段作为父群号
 * - 其它类型: 原样返回 channel_id
 */
export function toParentGroupNo(
  channelId: string | undefined | null,
  channelType: number | undefined | null,
): string {
  if (!channelId) return "";
  if (channelType === CHANNEL_TYPE_COMMUNITY_TOPIC) {
    const idx = channelId.indexOf(THREAD_CHANNEL_ID_SEPARATOR);
    if (idx > 0) return channelId.slice(0, idx);
    return channelId;
  }
  return channelId;
}
