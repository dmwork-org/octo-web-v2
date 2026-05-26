import { api } from "@/features/base/api/client";
import { getDeviceId } from "@/features/base/lib/device-id";

/**
 * Sidebar 聚合同步(对应旧 dmworkbase Service/SidebarService):
 *
 * POST /v1/sidebar/sync
 *
 * 关注 tab 的真实数据源(/categories 只给群分组结构,follow 关系 / DM / 子区都在这里):
 * - target_type=1 DM / 2 群 / 5 子区
 * - category_id:关注分组 UUID,null/缺失 = 未分类(默认分组)
 * - follow_sort:用户手动排序权重(同 category 内 ASC);后端 (pinned DESC, follow_sort ASC) 多键排,
 *   前端按 follow_sort 一锤定音(PM #337 spec)
 * - parent_channel_id:子区携带,指向父群 channelID(渲染嵌套 + 子区取消关注后反挂父群)
 *
 * 增量游标(版本):
 * - 首次/全量同步传 version=0, last_msg_seqs="";支持增量后再传
 * - follow_version 用于 /v1/follow/sort CAS,关注的乐观锁
 *
 * MVP 全量同步;增量留 P3+(SDK 游标接出来再做)。
 */

export const SidebarTargetType = {
  DM: 1,
  CHANNEL: 2,
  THREAD: 5,
} as const;

export interface SidebarItem {
  target_type: number;
  target_id: string;
  channel_type: number;
  channel_id: string;
  timestamp: number;
  unread: number;
  is_pinned: boolean;
  is_followed: boolean;
  /** 关注分组 UUID,null/缺失 = 未分类 */
  category_id?: string | null;
  /** group_category.sort */
  category_sort?: number;
  /** group_setting.follow_sort(用户手动排序权重) */
  follow_sort?: number;
  /** 子区携带,指向父群 channelID */
  parent_channel_id?: string;
}

export interface SidebarSyncResp {
  items: SidebarItem[];
  /** IM 会话游标,下次增量同步回传(MVP 不用) */
  version: number;
  /** user_follow_version,关注 sort CAS / 增量检测锚 */
  follow_version: number;
}

export interface SidebarSyncReq {
  tab: "follow" | "recent";
  /** IM 游标,首次/全量传 0 */
  version?: number;
  /** IM last_msg_seqs 透传,首次/全量传 "" */
  last_msg_seqs?: string;
  /** sidebar 只需 timestamp/unread,1 即可 */
  msg_count?: number;
}

export async function syncSidebar(req: SidebarSyncReq): Promise<SidebarSyncResp> {
  return api<SidebarSyncResp>("sidebar/sync", {
    method: "POST",
    body: {
      tab: req.tab,
      version: req.version ?? 0,
      last_msg_seqs: req.last_msg_seqs ?? "",
      msg_count: req.msg_count ?? 1,
      device_uuid: getDeviceId(),
    },
  });
}
