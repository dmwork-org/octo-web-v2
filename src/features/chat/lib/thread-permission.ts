import { Channel, ChannelTypeGroup, WKSDK } from "wukongimjssdk";

/**
 * 子区权限判定 — 1:1 对齐上游 `Service/threadPermission.ts`(issue #283 fix):
 *
 * 是否可以管理(归档 / 取消归档 / 编辑名称 / 删除)子区。两处归档入口必须共用一份口径,
 * 否则会出现"一处可见、一处不可见"撕裂:
 *   - 入口 A:ChannelSetting 的 thread.actions(老仓 module.tsx)
 *   - 入口 B:ThreadPanel 三点菜单 / list item inline 按钮
 *
 * **关键点**:角色必须从**父群**成员列表解析,不是子区频道自身缓存。子区频道成员
 * 从未被同步,读子区缓存会让非创建者的群主/管理员恒为 false。
 *
 * GroupRole 取值(对齐 base/api/endpoints/group.api.ts):
 *   1 = owner,2 = manager,其它 = normal
 */
const ROLE_OWNER = 1;
const ROLE_MANAGER = 2;

export function canManageThread(
  thread: { creator_uid?: string } | null | undefined,
  groupNo: string,
  myUid: string,
): boolean {
  if (!thread || !myUid) return false;
  if (thread.creator_uid && thread.creator_uid === myUid) return true;
  if (!groupNo) return false;

  const groupChannel = new Channel(groupNo, ChannelTypeGroup);
  const subscribers = WKSDK.shared().channelManager.getSubscribes(groupChannel);
  const me = subscribers?.find((s) => s.uid === myUid);
  const role = (me?.orgData as { role?: number } | undefined)?.role ?? me?.role;
  return role === ROLE_OWNER || role === ROLE_MANAGER;
}
