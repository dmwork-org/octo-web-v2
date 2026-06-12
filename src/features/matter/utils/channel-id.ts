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

/**
 * 把子区 channel_id 拆成 { groupNo, shortId }。
 *
 * 仅适用于 channel_type=5。格式为 "{父群 group_no}____{子区 short_id}"
 * (分隔符是 4 个下划线,见 dmworkim modules/thread/const.go ChannelIDSeparator)。
 * 格式不合法时返回 null,调用方按"解析失败"处理。
 */
export function parseThreadChannelId(
  channelId: string | undefined | null,
): { groupNo: string; shortId: string } | null {
  if (!channelId) return null;
  const idx = channelId.indexOf(THREAD_CHANNEL_ID_SEPARATOR);
  if (idx <= 0) return null;
  const groupNo = channelId.slice(0, idx);
  const shortId = channelId.slice(idx + THREAD_CHANNEL_ID_SEPARATOR.length);
  if (!groupNo || !shortId) return null;
  return { groupNo, shortId };
}
