/**
 * Friend(对应后端 /v1/friend/sync 响应 + swagger definitions/friend)。
 * 见 octo-server/modules/user/swagger/friend.yaml:311。
 */
export interface Friend {
  uid: string;
  name?: string;
  username?: string;
  email?: string;
  zone?: string;
  phone?: string;
  mute?: number;
  top?: number;
  sex?: number;
  category?: string;
  short_no?: string;
  chat_pwd_on?: number;
  screenshot?: number;
  revoke_remind?: number;
  receipt?: number;
  online?: number;
  last_offline?: number;
  device_flag?: number;
  /** 1 = 好友;0 = 陌生人;其他业务态 */
  follow?: number;
  be_deleted?: number;
  be_blacklist?: number;
  vercode?: string;
  source_desc?: string;
  remark?: string;
  is_upload_avatar?: number;
  /** 实名认证(YUJ-413,新加) */
  realname_verified?: boolean;
  real_name?: string;
  /** 机器人:1=AI bot */
  robot?: number;
}
