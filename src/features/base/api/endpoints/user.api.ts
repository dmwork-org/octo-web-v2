import { api } from "@/features/base/api/client";

/**
 * 用户详情(对应旧 dmworkbase UserInfo/vm.tsx → reloadChannelInfo):
 *
 * GET /v1/users/{uid}?group_no={?}
 *
 * 字段(精选,UserInfo / BotDetail 用):
 *   uid                ← 必有
 *   name / username    ← 名字
 *   short_no           ← 短号(展示用)
 *   avatar             ← 头像 URL(相对路径)
 *   remark             ← 好友备注
 *   sex                ← 性别(0 未知 / 1 男 / 2 女)
 *   robot              ← 是否 AI(0/1)
 *   follow             ← 是否已添加(0/1)
 *   status             ← 好友状态(0 陌生 / 1 已添加)
 *   vercode            ← 验证码(发起好友申请用)
 *   bio / description  ← 个人简介 / bot 描述
 *   home_space_id      ← 主空间(判断外部联系人用)
 *   home_space_name
 *   ...其余业务字段
 *
 * 注意:bot 也走这个接口,robot=1 时 BotDetail 渲染 description 优先。
 */

export interface UserDetail {
  uid: string;
  name?: string;
  username?: string;
  short_no?: string;
  avatar?: string;
  remark?: string;
  sex?: number;
  robot?: number;
  follow?: number;
  status?: number;
  vercode?: string;
  bio?: string;
  description?: string;
  category?: string;
  home_space_id?: string;
  home_space_name?: string;
}

export async function getUserDetail(uid: string, groupNo?: string): Promise<UserDetail> {
  return api<UserDetail>(`users/${uid}`, {
    query: groupNo ? { group_no: groupNo } : undefined,
  });
}
