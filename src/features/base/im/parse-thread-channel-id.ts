/**
 * 子区(thread)channelID 解析:`{groupNo}@{shortId}`
 *
 * 旧项目 `@octo/base/parseThreadChannelId` 同语义。channelType=7 (ChannelTypeCommunityTopic)
 * 的 channel 用此格式编码,SDK 内部不识别 — 业务层需要拆出 groupNo / shortId 后调
 * 子区相关 endpoint(threadGet / threadSetting / membersync 走父群 ID)。
 */
export function parseThreadChannelId(
  channelId: string,
): { groupNo: string; shortId: string } | null {
  const at = channelId.indexOf("@");
  if (at <= 0) return null;
  return { groupNo: channelId.substring(0, at), shortId: channelId.substring(at + 1) };
}
