import { api } from "@/features/base/api/client";

/**
 * 关注/分组 API(对应旧 dmworkbase Service/CategoryService + FollowService)。
 *
 * Category(分组):
 *   - GET    /v1/spaces/{spaceId}/categories            分组列表 + 各分组下群聊
 *   - POST   /v1/spaces/{spaceId}/categories            创建分组
 *   - PUT    /v1/spaces/{spaceId}/categories/{catId}    重命名
 *   - DELETE /v1/spaces/{spaceId}/categories/{catId}    删除
 *   - PUT    /v1/spaces/{spaceId}/categories/sort       批量排序(category_ids 顺序)
 *   - PUT    /v1/groups/{groupNo}/category              移动群到分组(category_id 必传 UUID,
 *                                                       移出分组传"默认分组" UUID,后端 PR #1007 起
 *                                                       不再接受空字符串)
 *
 * Follow(关注):
 *   - POST   /v1/follow/dm                              { peer_uid, category_id? }
 *   - DELETE /v1/follow/dm?peer_uid={uid}
 *   - POST   /v1/follow/channel/unfollow                { group_no }
 *   - POST   /v1/follow/channel/refollow                { group_no }
 *   - POST   /v1/follow/thread                          { thread_channel_id }
 *   - DELETE /v1/follow/thread?thread_channel_id={id}
 *   - PUT    /v1/follow/sort                            { items[], version }(乐观锁)
 *
 * target_type 枚举对齐旧 FollowTargetType:1=DM / 2=群 / 5=子区。
 */

export interface CategoryGroup {
  group_no: string;
  name: string;
  category_sort: number;
}

export interface CategoryItem {
  category_id: string | null;
  name: string;
  sort: number;
  groups: CategoryGroup[];
  /** 后端 PR #1007 起,默认分组有真实 UUID,通过此字段区分 */
  is_default?: boolean;
}

export const FollowTargetType = {
  DM: 1,
  CHANNEL: 2,
  THREAD: 5,
} as const;

// ─── Category ─────────────────────────────────────────────

export async function listCategories(spaceId: string): Promise<CategoryItem[]> {
  const resp = await api<CategoryItem[]>(`spaces/${encodeURIComponent(spaceId)}/categories`);
  return resp ?? [];
}

export async function createCategory(spaceId: string, name: string): Promise<CategoryItem> {
  return api<CategoryItem>(`spaces/${encodeURIComponent(spaceId)}/categories`, {
    method: "POST",
    body: { name },
  });
}

export async function renameCategory(
  spaceId: string,
  categoryId: string,
  name: string,
): Promise<void> {
  await api(`spaces/${encodeURIComponent(spaceId)}/categories/${encodeURIComponent(categoryId)}`, {
    method: "PUT",
    body: { name },
  });
}

export async function deleteCategory(spaceId: string, categoryId: string): Promise<void> {
  await api(`spaces/${encodeURIComponent(spaceId)}/categories/${encodeURIComponent(categoryId)}`, {
    method: "DELETE",
  });
}

export async function sortCategories(spaceId: string, categoryIds: string[]): Promise<void> {
  await api(`spaces/${encodeURIComponent(spaceId)}/categories/sort`, {
    method: "PUT",
    body: { category_ids: categoryIds },
  });
}

export async function moveGroupToCategory(groupNo: string, categoryId: string): Promise<void> {
  await api(`groups/${encodeURIComponent(groupNo)}/category`, {
    method: "PUT",
    body: { category_id: categoryId },
  });
}

// ─── Follow ─────────────────────────────────────────────

export async function followDM(peerUid: string, categoryId?: string | null): Promise<void> {
  await api("follow/dm", {
    method: "POST",
    body: { peer_uid: peerUid, category_id: categoryId ?? null },
  });
}

export async function unfollowDM(peerUid: string): Promise<void> {
  await api("follow/dm", {
    method: "DELETE",
    query: { peer_uid: peerUid },
  });
}

export async function unfollowChannel(groupNo: string): Promise<void> {
  await api("follow/channel/unfollow", {
    method: "POST",
    body: { group_no: groupNo },
  });
}

export async function refollowChannel(groupNo: string): Promise<void> {
  await api("follow/channel/refollow", {
    method: "POST",
    body: { group_no: groupNo },
  });
}

export async function followThread(threadChannelId: string): Promise<void> {
  await api("follow/thread", {
    method: "POST",
    body: { thread_channel_id: threadChannelId },
  });
}

export async function unfollowThread(threadChannelId: string): Promise<void> {
  await api("follow/thread", {
    method: "DELETE",
    query: { thread_channel_id: threadChannelId },
  });
}

export interface FollowSortItem {
  target_type: number;
  target_id: string;
  sort: number;
}

export async function sortFollows(items: FollowSortItem[], version: number): Promise<void> {
  await api("follow/sort", {
    method: "PUT",
    body: { items, version },
  });
}
