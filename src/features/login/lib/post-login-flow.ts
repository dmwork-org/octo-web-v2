import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { authActions, type AuthUser } from "@/features/base/stores/auth";
import { joinSpace } from "@/features/base/api/endpoints/space.api";
import type { LoginResp } from "@/features/base/api/endpoints/user.api";

/**
 * 登录成功后的统一收尾(对齐老仓 LoginVM.loginSuccess + AppLayout.onLogin):
 *
 * 1. `authActions.signIn(token, user)` 写入 store(自动持久化 localStorage)
 * 2. 如果有合法邀请码 → 调 `joinSpace(inviteCode)` 自动加入对应 space
 *    (失败静默 — 用户进首页后可手动重试,不阻塞登录)
 * 3. 清掉 `pendingInviteCode`(SSO 中转用,清掉避免下次再触发)
 * 4. `navigate(redirect ?? "/", replace=true)`(replace 避免回退到登录页)
 *
 * **邀请码合法性**:必须匹配 `/^[a-zA-Z0-9_-]+$/`(对齐老仓 sanitize 规则),
 * 防 URL 注入。
 *
 * **SSO 邀请中转**:用户带 `?invite_code=X` 进登录页,点 SSO 时写
 * `localStorage.pendingInviteCode = X`,回调后 LoginVM / BindPage 读这个值。
 */

const INVITE_CODE_REGEX = /^[a-zA-Z0-9_-]+$/;
const PENDING_INVITE_KEY = "pendingInviteCode";

export function loginRespToAuthUser(resp: LoginResp): AuthUser {
  return {
    uid: resp.uid,
    name: resp.name ?? "",
    username: resp.username ?? "",
    app_id: resp.app_id,
    short_no: resp.short_no,
    zone: resp.zone,
    phone: resp.phone,
  };
}

/** 读 localStorage 中转的 pendingInviteCode(SSO 流程跨域回来时用)。 */
export function readPendingInviteCode(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(PENDING_INVITE_KEY);
    if (!v || !INVITE_CODE_REGEX.test(v)) return null;
    return v;
  } catch {
    return null;
  }
}

/** SSO 跳走前把 invite_code 写到 localStorage(回调后 read)。 */
export function writePendingInviteCode(code: string | undefined): void {
  if (typeof window === "undefined") return;
  if (!code || !INVITE_CODE_REGEX.test(code)) {
    clearPendingInviteCode();
    return;
  }
  try {
    window.localStorage.setItem(PENDING_INVITE_KEY, code);
  } catch {
    // ignore
  }
}

export function clearPendingInviteCode(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PENDING_INVITE_KEY);
  } catch {
    // ignore
  }
}

/**
 * 登录后流程 hook — 返回 `finalize(resp)` 闭包。
 *
 * @param inviteCode 当前 URL 的 invite_code(优先于 pendingInviteCode);两个都空 → 不 join
 * @param redirect 登录后跳目标(默认 `/`)
 */
export function useFinalizeLogin(inviteCode: string | undefined, redirect: string | undefined) {
  const navigate = useNavigate();
  return useCallback(
    async (resp: LoginResp) => {
      authActions.signIn(resp.token, loginRespToAuthUser(resp));

      const effectiveCode =
        inviteCode && INVITE_CODE_REGEX.test(inviteCode) ? inviteCode : readPendingInviteCode();
      if (effectiveCode) {
        try {
          await joinSpace(effectiveCode);
        } catch {
          // ignore — 进首页后用户可手动重试,不阻塞登录
        }
        clearPendingInviteCode();
      }

      void navigate({ href: redirect ?? "/", replace: true });
    },
    [navigate, inviteCode, redirect],
  );
}
