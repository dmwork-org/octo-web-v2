import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { authActions, type AuthUser } from "@/features/base/stores/auth";
import { spaceActions } from "@/features/base/stores/space";
import { getInviteInfo, getMySpaces, joinSpace } from "@/features/base/api/endpoints/space.api";
import type { LoginResp } from "@/features/base/api/endpoints/user.api";

/**
 * 登录成功后的统一收尾(对齐老仓 LoginVM.loginSuccess + AppLayout.onLogin):
 *
 * 1. `authActions.signIn(token, user)` 写入 token + user(localStorage 持久化)
 * 2. **清残留 spaceId**(关键 — 防止用上次登录的 space 调 API 拿到 "你不是
 *    该空间成员" 错误,对齐老仓 logout 清 currentSpaceId 的语义)
 * 3. 检 effectiveCode(URL `?invite_code=` 优先,fallback `localStorage.pendingInviteCode`
 *    — SSO 跨域中转):
 *    - 有 invite:`getInviteInfo` 拿 space_id → `joinSpace` → `setSpace(新 space_id)`
 *    - 无 invite:拉 `getMySpaces`:
 *        · 有 → `setSpace(第一个 space.space_id)`
 *        · 无 → `setSpace(null)` 不带 space 上下文进首页(首页应显引导/空态)
 * 4. 清掉 `pendingInviteCode`
 * 5. `navigate(redirect ?? "/", replace=true)`
 *
 * **邀请码合法性**:`/^[a-zA-Z0-9_-]+$/`(对齐老仓 sanitize 规则)。
 *
 * **失败降级**:join space / getMySpaces 失败时 toast 不弹(默认 fetch interceptor
 * 会兜底);spaceId 维持 null,首页负责显示空态。**不阻塞登录跳转**。
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
      // 1. 写 token + user(localStorage 持久化生效)
      authActions.signIn(resp.token, loginRespToAuthUser(resp));

      // 2. 清残留 spaceId — 新用户/换账号不应继承上次的 space 上下文
      spaceActions.setSpace(null);

      // 3. 决定要进哪个 space
      const effectiveCode =
        inviteCode && INVITE_CODE_REGEX.test(inviteCode) ? inviteCode : readPendingInviteCode();

      if (effectiveCode) {
        // 邀请码:join + 切到新 space
        try {
          const info = await getInviteInfo(effectiveCode);
          await joinSpace(effectiveCode);
          if (info?.space_id) spaceActions.setSpace(info.space_id);
        } catch {
          // ignore — 进首页后用户可手动重试
        }
        clearPendingInviteCode();
        void navigate({ href: redirect ?? "/", replace: true });
        return;
      }

      // 无邀请:拉 my spaces 决定走向(对齐老仓 checkSpaceAndLogin)
      try {
        const spaces = await getMySpaces();
        if (spaces.length > 0) {
          spaceActions.setSpace(spaces[0].space_id);
          void navigate({ href: redirect ?? "/", replace: true });
        } else {
          // 没空间 → 引导加入(对齐老仓 onNeedJoinSpace → JoinSpacePage)
          void navigate({ to: "/joinspace", replace: true });
        }
      } catch {
        // 拉 spaces 失败 → 兜底跳引导页让用户输邀请码,不留在登录页
        void navigate({ to: "/joinspace", replace: true });
      }
    },
    [navigate, inviteCode, redirect],
  );
}
