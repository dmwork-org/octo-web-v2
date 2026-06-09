import type { Conversation } from "wukongimjssdk";

/**
 * Thread 状态枚举(对齐旧 dmworkbase `Service/Thread.ts ThreadStatus`):
 *
 *   1 = Active(活跃,默认)
 *   2 = Archived(归档,关注 tab 展开父群时默认隐藏)
 *   3 = Deleted(删除,thread-created-renderer 已用,这里也声明便于共享)
 *
 * 状态从 `channelInfo.orgData.thread.status` 读;未加载 / 缺字段 fail-open 当 Active。
 */
export const THREAD_STATUS_ACTIVE = 1;
export const THREAD_STATUS_ARCHIVED = 2;
export const THREAD_STATUS_DELETED = 3;

/**
 * 是否是已归档子区(对齐上游 645fa295 isArchivedThreadConversation):
 *
 * fail-open 设计 — 必须 channel 是子区且 `thread.status === Archived` 才算归档。
 * status 未知 / channelInfo 未加载(sidebar-only 子区未补齐 channelInfo)一律视为
 * 可见,避免误隐藏活跃子区。
 *
 * 用法:关注 tab 展开父群子区时调 `filterArchivedThreads` 过滤,角标计算用
 * `aggregateThreadUnread` 时跳过 archived,保持"角标数 = 列表可见未读"一致。
 */
export function isArchivedThread(conv: Conversation): boolean {
  // 子区在 ChannelTypeCommunityTopic(5),用 number 直接比避免引 SDK enum:
  if (conv.channel.channelType !== 5) return false;
  const orgData = conv.channelInfo?.orgData as { thread?: { status?: number } } | undefined;
  return orgData?.thread?.status === THREAD_STATUS_ARCHIVED;
}

/** 过滤掉明确已归档的子区(非子区/未知 status 保留)。 */
export function filterArchivedThreads(convs: Conversation[]): Conversation[] {
  return convs.filter((c) => !isArchivedThread(c));
}
