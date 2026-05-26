/**
 * 子区(thread)channelID 解析:`{groupNo}____{shortId}`(4 个下划线作分隔符)
 *
 * 旧项目 `dmworkbase/src/Service/Thread.ts` 同语义:
 *   export const ThreadChannelIdSeparator = '____'
 *
 * channelType=5 (ChannelTypeCommunityTopic) 的 channel 用此格式编码,SDK 内部
 * 不识别 — 业务层需要拆出 groupNo / shortId 后调子区相关 endpoint(threadGet /
 * threadSetting / membersync 走父群 ID)。
 *
 * 注意:旧代码注释里写的是 `{groupNo}@{shortId}`,但实际实现一直用 `____`,
 * 注释是历史 stale。本项目早期 refactor 误信注释用了 `@`,排子区 mention 时才
 * 暴露,fixed in 2026-05-26。
 */
const SEPARATOR = "____";

export function parseThreadChannelId(
  channelId: string,
): { groupNo: string; shortId: string } | null {
  const parts = channelId.split(SEPARATOR);
  if (parts.length !== 2) return null;
  return { groupNo: parts[0], shortId: parts[1] };
}

export function buildThreadChannelId(groupNo: string, shortId: string): string {
  return `${groupNo}${SEPARATOR}${shortId}`;
}
