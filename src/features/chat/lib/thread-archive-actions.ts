import type { ThreadRaw } from "@/features/base/api/endpoints/group.api";
import { THREAD_STATUS_ACTIVE, THREAD_STATUS_ARCHIVED } from "@/features/chat/lib/thread-status";

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
