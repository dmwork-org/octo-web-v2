import WKSDK, { Channel } from "wukongimjssdk";
import type { ThreadRaw } from "@/features/base/api/endpoints/group.api";
import { buildThreadChannelId } from "@/features/base/im/parse-thread-channel-id";
import { THREAD_STATUS_ACTIVE, THREAD_STATUS_ARCHIVED } from "@/features/chat/lib/thread-status";

/** ChannelType 5 = ChannelTypeCommunityTopic(子区);SDK 未导出常量,本仓多处用相同声明。 */
const CHANNEL_TYPE_THREAD = 5;

/**
 * 行内归档按钮要执行的动作 — 1:1 对齐上游 `c13e7e27` archiveActions.ts。
 *
 * 由 thread.status 推导:
 *   - Active (1) → "archive"
 *   - Archived (2) → "unarchive"
 *   - 其它(如 Deleted=3) → null(不可操作)
 *
 * 抽成纯函数让活跃组 / 已归档组共用同一行组件,按状态区分图标和文案。
 */
export type ArchiveAction = "archive" | "unarchive";

export function deriveArchiveAction(thread: ThreadRaw): ArchiveAction | null {
  if (thread.status === THREAD_STATUS_ACTIVE || !thread.status) return "archive";
  if (thread.status === THREAD_STATUS_ARCHIVED) return "unarchive";
  return null;
}

/**
 * 是否渲染行内归档按钮。
 *
 * 需同时满足:
 * 1. 有编辑权限(canEdit,跟详情菜单一致;无权限不显示)
 * 2. 能推导出有效动作(deriveArchiveAction 非 null)
 */
export function shouldShowArchiveButton(thread: ThreadRaw, canEdit: boolean): boolean {
  return canEdit && deriveArchiveAction(thread) !== null;
}

/**
 * 归档/取消归档成功后 必须 调:清 SDK channelInfo 缓存并主动 refetch
 * (对齐上游 `ThreadPanel.refreshThreadChannelInfo`)。
 *
 * **为什么必须**:follow-list / sidebar / conv list 都通过
 * `Conversation.channelInfo.orgData.thread.status` 读子区归档状态(`isArchivedThread`
 * 在 `lib/thread-status.ts`)。SDK channelInfo 是带缓存的,后端 archive 接口
 * 返回成功后 SDK cache 仍是旧 status → `filterArchivedThreads` 不能正确隐藏/显示
 * → **关注列表 / 侧边栏不刷新**(issue #72 现象)。
 *
 * 调用后 `channelInfoListener`(`use-conversations-sync.hook.ts:51`)会被推送触发,
 * 重写 conversations snapshot,UI 自动 reactive 更新。无需手动 invalidate
 * conversationsQueryKey(那会重新拉一次网络,多余)。
 */
export function refreshThreadChannelInfoCache(groupNo: string, shortId: string): void {
  const channelId = buildThreadChannelId(groupNo, shortId);
  const channel = new Channel(channelId, CHANNEL_TYPE_THREAD);
  WKSDK.shared().channelManager.deleteChannelInfo(channel);
  void WKSDK.shared().channelManager.fetchChannelInfo(channel);
}

export function syncThreadArchiveState(groupNo: string, shortId: string, status: number): void {
  const channelId = buildThreadChannelId(groupNo, shortId);
  const channel = new Channel(channelId, CHANNEL_TYPE_THREAD);
  const cm = WKSDK.shared().channelManager;
  const info = cm.getChannelInfo(channel);
  if (!info) return;
  const orgData = (info.orgData ?? {}) as Record<string, unknown>;
  const thread = (orgData.thread ?? {}) as Record<string, unknown>;
  thread.status = status;
  orgData.thread = thread;
  info.orgData = orgData;
  cm.setChannleInfoForCache(info);
  cm.notifyListeners(info);
}
