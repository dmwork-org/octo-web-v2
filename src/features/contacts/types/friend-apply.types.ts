/** FriendApply(对应旧 packages/dmworkbase/src/App.tsx FriendApply 类型 + FriendApplyState)。 */
export const FriendApplyStatus = {
  apply: 0,
  accepted: 1,
  refused: 2,
} as const;

export type FriendApplyStatusValue = (typeof FriendApplyStatus)[keyof typeof FriendApplyStatus];

export interface FriendApply {
  uid: string;
  to_uid: string;
  to_name?: string;
  status: FriendApplyStatusValue;
  remark?: string;
  /** friendSure 时需要传后端,标识申请凭据。 */
  token?: string;
  unread?: boolean;
  created_at?: string;
  /** 时间戳 / 倒序排序用 */
  createdAt?: number;
}
