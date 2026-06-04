import { api } from "@/features/base/api/client";

/**
 * SSO/OIDC API(对齐老仓 dmworklogin/src/oidc/api.ts + bind/api.ts):
 *
 * 流程:
 *  1. 用户点 provider → `getOidcAuthcode()` 拿 authcode
 *  2. 写 pending session(sessionStorage)+ 跳 `provider.authorizePath?authcode=...`
 *  3. 回调 /login → `resumeOidc()` 触发 `pollOidcAuthStatus()` 轮询
 *  4. status=1(SUCCESS)→ `result` 是完整 LoginResp;status=2(FAILED)→ msg 错误
 *
 * 二级绑定(系统已识别身份但需绑定老账号):
 *  - `/bind/info?token=` 拿到候选方式 + 是否允许 create
 *  - `/bind/verify/{password|otp}` 验证身份;409 = session 已 verified(跳 confirm)
 *  - `/bind/confirm` 用已验证 session 完成绑定 → 返回 LoginResp
 *  - `/bind/create` 直接用 SSO claims 创账号(skip verify;仅当 allow_create)
 */

import type { LoginResp } from "@/features/base/api/endpoints/user.api";

// ---------------------------------------------------------------------------
// OIDC 状态常量
// ---------------------------------------------------------------------------
export const OIDC_AUTH_STATUS = {
  PENDING: 0,
  SUCCESS: 1,
  FAILED: 2,
} as const;

/** authcode 有效期 5 分钟(对齐老仓 OIDC_AUTHCODE_TTL_MS)。 */
export const OIDC_AUTHCODE_TTL_MS = 5 * 60 * 1000;

/** poll 间隔 / 最大次数 / 连续错误上限。 */
export const OIDC_POLL_INTERVAL_MS = 2000;
export const OIDC_POLL_MAX_ATTEMPTS = 150;
export const OIDC_POLL_MAX_CONSECUTIVE_ERRORS = 10;

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

export interface OidcProvider {
  /** provider id(后端枚举,如 "xming" / "mlamp")。 */
  id: string;
  name: string;
  /** 授权页 URL(用 authcode 拼 query)。 */
  authorizePath: string;
  /** 账户中心 URL(用于个人信息编辑外跳)。 */
  accountUrl?: string;
  /** 重置密码 URL(SSO 用户走 IdP 自身的重置流程)。 */
  resetPasswordUrl?: string;
}

export interface OidcAuthcodeResp {
  authcode: string;
}

export interface OidcAuthStatusResp {
  status: number;
  /** SUCCESS 时:LoginResp;FAILED 时:undefined */
  result?: LoginResp;
  msg?: string;
}

// ---------------------------------------------------------------------------
// SSO 主流程 API
// ---------------------------------------------------------------------------

/** 启动 SSO — 拿 authcode(后续跳到 provider.authorizePath 时带上)。 */
export async function getOidcAuthcode(): Promise<OidcAuthcodeResp> {
  return api<OidcAuthcodeResp>("user/thirdlogin/authcode");
}

/** 轮询 SSO 状态 — IdP 回调后用 authcode 查 login 结果。 */
export async function getOidcAuthStatus(authcode: string): Promise<OidcAuthStatusResp> {
  return api<OidcAuthStatusResp>("user/thirdlogin/authstatus", { query: { authcode } });
}

// ---------------------------------------------------------------------------
// 二级绑定 API(BindPage 用)
// ---------------------------------------------------------------------------

export type BindMethod = "password" | "sms_otp";

/** 后端 create 不可用时的原因码(对应老仓 BindCreateBlocked union)。 */
export type BindCreateBlocked =
  | ""
  | "disabled"
  | "claims_incomplete"
  | "manual_conflict"
  | "consumed";

export interface BindInfoResp {
  /** SSO 侧解析出的用户显示名(用于 UI 文案)。 */
  name?: string;
  masked_email?: string;
  masked_phone?: string;
  /** 候选验证方式 — 通常为 `password` + `sms_otp` 子集。 */
  methods: BindMethod[];
  /** 是否允许 SSO 直接 create 账号(claims 完整 + 后端允许)。 */
  allow_create?: boolean;
  /** 不可 create 时的原因(为空字符串表示可 create)。 */
  create_blocked?: BindCreateBlocked;
}

export interface BindVerifyStatusResp {
  status: "verified" | "sent" | "ok";
}

export interface BindConfirmResp {
  status: "ok";
  login_resp: LoginResp;
  uid: string;
}

function bindBase(provider: string) {
  return `auth/oidc/${provider}/bind`;
}

export async function getBindInfo(provider: string, token: string): Promise<BindInfoResp> {
  return api<BindInfoResp>(`${bindBase(provider)}/info`, { query: { token } });
}

export async function verifyBindPassword(
  provider: string,
  payload: { token: string; identifier: string; password: string },
): Promise<BindVerifyStatusResp> {
  return api<BindVerifyStatusResp>(`${bindBase(provider)}/verify/password`, {
    method: "POST",
    body: payload,
  });
}

export async function sendBindOtp(provider: string, token: string): Promise<BindVerifyStatusResp> {
  return api<BindVerifyStatusResp>(`${bindBase(provider)}/verify/otp/send`, {
    method: "POST",
    body: { token },
  });
}

export async function checkBindOtp(
  provider: string,
  payload: { token: string; code: string },
): Promise<BindVerifyStatusResp> {
  return api<BindVerifyStatusResp>(`${bindBase(provider)}/verify/otp/check`, {
    method: "POST",
    body: payload,
  });
}

export async function confirmBind(provider: string, token: string): Promise<BindConfirmResp> {
  return api<BindConfirmResp>(`${bindBase(provider)}/confirm`, {
    method: "POST",
    body: { token },
  });
}

export async function createBoundAccount(
  provider: string,
  token: string,
): Promise<BindConfirmResp> {
  return api<BindConfirmResp>(`${bindBase(provider)}/create`, {
    method: "POST",
    body: { token },
  });
}
