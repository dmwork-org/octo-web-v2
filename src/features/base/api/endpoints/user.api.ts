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
  is_external?: number;
  source_space_name?: string;
  source_desc?: string;
  // OCTO 实名认证(对应 displayName / RealnameVerifiedBadge 消费)
  real_name?: string;
  realname_verified?: boolean | number | string;
  /** 实名认证时间戳(秒级,后端 dmworkim sync_worker 每 15min 从 IdP 同步)。 */
  realname_verified_at?: number;
  // Bot 专用字段(robot=1 时填充,对应旧 BotDetailModal 读取的)
  bot_description?: string;
  bot_creator_uid?: string;
  bot_creator_name?: string;
  bot_commands?: string;
}

export async function getUserDetail(uid: string, groupNo?: string): Promise<UserDetail> {
  return api<UserDetail>(`users/${uid}`, {
    query: groupNo ? { group_no: groupNo } : undefined,
  });
}

// ---------------------------------------------------------------------------
// Login / Register / Forget Password / QRCode / Update Current
// 对齐老仓 dmworklogin Service。所有响应字段命名严格跟老仓后端契约。
// ---------------------------------------------------------------------------

/** 登录 / 注册 mutation 公共响应字段(对应老仓 loginSession.applyLoginResp 写入)。 */
export interface LoginResp {
  uid: string;
  token: string;
  name?: string;
  username?: string;
  app_id?: string;
  short_no?: string;
  zone?: string;
  phone?: string;
  sex?: number;
  category?: string;
  realname_verified?: boolean | number;
  real_name?: string;
  realname_verified_at?: number;
  /** 用户语言偏好(BCP 47),后端可能下发也可能不下发;登录后若存在则自动应用。 */
  language?: string;
}

export interface LoginDevice {
  device_id: string;
  device_name: string;
  device_model: string;
}

/** 二维码登录 — 用 authCode 换 token。 */
export async function loginByAuthcode(authCode: string, device: LoginDevice): Promise<LoginResp> {
  return api<LoginResp>(`user/login_authcode/${authCode}`, {
    method: "POST",
    body: { flag: 1, device },
  });
}

/** 用户名注册(usernameregister)— 对齐老仓 requestRegister。 */
export async function registerByUsername(payload: {
  username: string;
  name: string;
  password: string;
  device: LoginDevice;
}): Promise<LoginResp> {
  return api<LoginResp>("user/usernameregister", {
    method: "POST",
    body: { ...payload, flag: 1 },
  });
}

/** 邮箱注册(emailregister)— 对齐老仓 requestEmailRegister。 */
export async function registerByEmail(payload: {
  email: string;
  password: string;
  name: string;
  code: string;
  device: LoginDevice;
}): Promise<LoginResp> {
  return api<LoginResp>("user/emailregister", {
    method: "POST",
    body: { ...payload, flag: 1 },
  });
}

/** 邮箱+密码登录 — 对齐老仓 requestEmailLogin。 */
export async function loginByEmail(payload: {
  email: string;
  password: string;
  device: LoginDevice;
}): Promise<LoginResp> {
  return api<LoginResp>("user/emaillogin", {
    method: "POST",
    body: { ...payload, flag: 1 },
  });
}

/**
 * 发送邮箱验证码:
 * - code_type=0:注册
 * - code_type=2:找回密码
 */
export async function sendEmailCode(email: string, codeType: 0 | 2): Promise<void> {
  await api("user/email/sendcode", {
    method: "POST",
    body: { email, code_type: codeType },
  });
}

/** 重置密码(忘记密码流程)。 */
export async function resetPassword(payload: {
  email: string;
  code: string;
  new_password: string;
}): Promise<void> {
  await api("user/email/forgetpwd", { method: "POST", body: payload });
}

/** 获取二维码 UUID(loginuuid)。 */
export interface LoginUuidResp {
  uuid: string;
  qrcode: string;
}
export async function getLoginUuid(device: LoginDevice): Promise<LoginUuidResp> {
  // 老仓 login_vm.tsx:419 把整个 device 展开传 query(device_id + device_name + device_model),
  // 后端用三个字段一起签 uuid;只传 device_id 会拿不到 qrcode。
  return api<LoginUuidResp>("user/loginuuid", { query: { ...device } });
}

/**
 * 二维码扫描状态轮询(loginstatus)。
 * status:0=waitScan / 1=scanned(showAvatar)/ 2=authed(authCode 可用)/ 3=expired
 */
export interface LoginStatusResp {
  status: number;
  auth_code?: string;
  uid?: string;
  avatar?: string;
  name?: string;
}
export async function getLoginStatus(uuid: string): Promise<LoginStatusResp> {
  return api<LoginStatusResp>("user/loginstatus", { query: { uuid } });
}

/** 修改当前用户信息(name / sex / category 等)。 */
export interface UpdateCurrentPayload {
  name?: string;
  sex?: number;
  category?: string;
}
export async function updateCurrentUser(payload: UpdateCurrentPayload): Promise<void> {
  await api("user/current", { method: "PUT", body: payload });
}

/** 上传头像(FormData multipart)。 */
export async function uploadAvatar(uid: string, file: File | Blob): Promise<void> {
  const form = new FormData();
  form.append("file", file);
  await api(`users/${uid}/avatar`, { method: "POST", body: form });
}

/**
 * 更新当前用户语言偏好(对齐老仓 dmworkbase UserLanguageService.update):
 * PUT /v1/user/language,body { language }。空串 = 清空回 OCTO_DEFAULT_LANGUAGE。
 *
 * 后端见 octo-server modules/user/api.go:setLanguage。多端同步:其他端 token
 * 缓存下次请求由 AuthMiddleware LanguageResolver hydrate(不需强制重新登录)。
 */
export async function updateUserLanguage(language: string): Promise<void> {
  await api("user/language", { method: "PUT", body: { language } });
}
