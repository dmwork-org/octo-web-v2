/**
 * Bind 流程错误映射(对齐老仓 dmworklogin/src/bind/errorMessages.ts)。
 *
 * - `terminal` = true → 走 fatal stage(显独立错误页 + 重启 SSO 链接)
 * - `terminal` = false → 走 inline error(可在当前 stage 重试)
 *
 * 老仓按 endpoint 精细化文案,本期复刻关键分支(其余落兜底)。
 */

import { extractSafeErrorMessage } from "@/features/login/lib/sanitize-error";

export type BindEndpoint =
  | "info"
  | "verify_password"
  | "verify_otp_send"
  | "verify_otp_check"
  | "confirm"
  | "create";

export interface BindErrorDisplay {
  message: string;
  terminal: boolean;
}

interface HttpErrorLike {
  status?: number;
  data?: { msg?: unknown; message?: unknown };
}

function getStatus(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  const status = (err as HttpErrorLike).status;
  return typeof status === "number" ? status : undefined;
}

export function mapBindError(endpoint: BindEndpoint, err: unknown): BindErrorDisplay {
  const status = getStatus(err);

  // info 阶段任何 4xx/5xx 都是 terminal — 链接坏了 / token 过期 / 后端关停,
  // 都没法让用户在原 stage 继续
  if (endpoint === "info") {
    if (status === 401 || status === 403 || status === 404 || status === 410) {
      return { message: "绑定链接已失效，请重新发起 SSO 登录", terminal: true };
    }
    if (status === 409) {
      return { message: "当前链接已使用过，请重新发起 SSO 登录", terminal: true };
    }
    return { message: extractSafeErrorMessage(err) || "加载绑定信息失败", terminal: true };
  }

  // confirm / create — terminal:token 已消费或 session 异常
  if (endpoint === "confirm" || endpoint === "create") {
    if (status === 401 || status === 403 || status === 410) {
      return { message: "会话已失效，请重新发起 SSO 登录", terminal: true };
    }
    if (status === 409) {
      return { message: "当前链接已使用过，请重新发起 SSO 登录", terminal: true };
    }
    return { message: extractSafeErrorMessage(err) || "绑定失败，请重试", terminal: false };
  }

  // verify_*:大多 inline(密码错 / 验证码错 / 发送过频)
  if (status === 429) {
    return { message: "发送过于频繁，请稍后再试", terminal: false };
  }
  return { message: extractSafeErrorMessage(err) || "操作失败，请重试", terminal: false };
}

/** verify_password / verify_otp_check 收到 409 = 已 verified,直接跳 confirm(非错误)。 */
export function isVerifyAlreadyConsumed(err: unknown): boolean {
  return getStatus(err) === 409;
}
