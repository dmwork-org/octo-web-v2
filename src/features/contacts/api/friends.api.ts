import { api } from "@/features/base/api/client";

/**
 * 申请加好友(对应旧 datasource::friendApply)。
 * POST /v1/friend/apply { to_uid, remark, vercode }
 * vercode 来自搜索结果 Friend.vercode 字段(后端发的一次性凭证)。
 *
 * 本期 contacts 内部不再消费(friend-add sub-page 已砍),只服务于
 * features/base/components/modals/{friend-apply-modal, bot-detail-modal}。
 * 加好友主入口 P4+ 跨模块到 chat menu。
 */
export async function applyFriend(req: {
  to_uid: string;
  remark?: string;
  vercode?: string;
}): Promise<void> {
  await api("friend/apply", {
    method: "POST",
    body: {
      to_uid: req.to_uid,
      remark: req.remark ?? "",
      vercode: req.vercode ?? "",
    },
  });
}

/**
 * 设置好友备注(对应旧 CommonDataSource::userRemark)。
 * 服务于 features/base/components/modals/user-info-modal。
 * PUT /v1/friend/remark { uid, remark }
 */
export async function setUserRemark(uid: string, remark: string): Promise<void> {
  await api("friend/remark", {
    method: "PUT",
    body: { uid, remark },
  });
}

/**
 * 解除好友关系(对应旧 CommonDataSource::deleteFriend)。
 * 服务于 features/base/components/modals/user-info-modal。
 * DELETE /v1/friends/{uid}
 */
export async function deleteFriend(uid: string): Promise<void> {
  await api(`friends/${encodeURIComponent(uid)}`, { method: "DELETE" });
}
