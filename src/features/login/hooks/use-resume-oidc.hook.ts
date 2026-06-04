import { useState, useEffect, useRef } from "react";
import {
  clearPendingOidcLogin,
  getPendingOidcLogin,
  isPendingExpired,
} from "@/features/login/oidc/pending";
import { parseOidcUrlState } from "@/features/login/oidc/url";
import {
  pollAuthStatus,
  OidcPollCancelledError,
  OidcPollNetworkError,
  OidcPollTimeoutError,
} from "@/features/login/oidc/poller";
import { OIDC_AUTH_STATUS, type OidcProvider } from "@/features/base/api/endpoints/oidc.api";
import type { LoginResp } from "@/features/base/api/endpoints/user.api";

/**
 * 登录页 mount 时检 pending OIDC session,有则启动 poll(对齐老仓
 * LoginVM.resumeOidcLoginIfPending)。
 *
 * 流程:
 *   1. 读 location.search 检 `?oidc_error=1`(IdP 通知失败,但仅当本地有 pending 才信)
 *   2. 读 sessionStorage 拿 pending(无 → 无操作,普通登录页)
 *   3. pending 过期(>5min)→ 清 + 报"登录超时"
 *   4. 启动 pollAuthStatus,SUCCESS → 调 onSuccess(LoginResp);FAILED/Error → 报文案
 *
 * **防重入**:guard `started` ref,即使父层 remount 也不开第二个 poll。
 *
 * 用法:登录页 mount 后调一次。组件 unmount 会 abort 当前 fetch。
 */

export interface ResumeOidcState {
  resuming: boolean;
  providerName?: string;
  /** 失败/超时/取消的 user-facing 文案;成功时 undefined。 */
  error: string | null;
}

export interface UseResumeOidcOptions {
  /** appconfig 解析出的 providers — 用于把 providerId 映射到 name(展示用)。 */
  providers: OidcProvider[];
  /** SUCCESS 时调,view 用 LoginResp 进 authActions.signIn + 跳 redirect。 */
  onSuccess: (resp: LoginResp, providerId: string) => void;
}

function useResumeEffect(
  options: UseResumeOidcOptions,
  setState: (updater: (prev: ResumeOidcState) => ResumeOidcState) => void,
  startedRef: React.MutableRefObject<boolean>,
  abortRef: React.MutableRefObject<AbortController | null>,
) {
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const urlState = parseOidcUrlState(window.location.search);
    const pending = getPendingOidcLogin();
    // ?oidc_error=1 只在本地确实有 pending 时信任,否则可能是外链伪造
    if (urlState.error && pending) {
      const name = options.providers.find((p) => p.id === pending.providerId)?.name ?? "SSO";
      clearPendingOidcLogin();
      setState(() => ({ resuming: false, providerName: name, error: `${name} 登录失败，请重试` }));
      return;
    }
    if (!pending) return; // 普通登录,无 OIDC 流程
    if (isPendingExpired(pending)) {
      clearPendingOidcLogin();
      setState(() => ({ resuming: false, error: "登录超时，请重新发起" }));
      return;
    }

    const providerName = options.providers.find((p) => p.id === pending.providerId)?.name ?? "SSO";
    setState(() => ({ resuming: true, providerName, error: null }));
    const controller = new AbortController();
    abortRef.current = controller;

    const cancelled = { current: false };
    const run = async () => {
      try {
        const result = await pollAuthStatus({
          authcode: pending.authcode,
          isCancelled: () => cancelled.current,
          signal: controller.signal,
        });
        if (result.status === OIDC_AUTH_STATUS.SUCCESS && result.result) {
          clearPendingOidcLogin();
          setState(() => ({ resuming: false, providerName, error: null }));
          options.onSuccess(result.result, pending.providerId);
        } else {
          clearPendingOidcLogin();
          setState(() => ({
            resuming: false,
            providerName,
            error: result.msg || `${providerName} 登录失败`,
          }));
        }
      } catch (e) {
        clearPendingOidcLogin();
        let msg = "登录失败，请重试";
        if (e instanceof OidcPollTimeoutError) msg = "登录超时，请重新发起";
        else if (e instanceof OidcPollCancelledError) msg = "已取消登录";
        else if (e instanceof OidcPollNetworkError) msg = "网络异常，请检查网络后重试";
        setState(() => ({ resuming: false, providerName, error: msg }));
      }
    };
    void run();

    return () => {
      cancelled.current = true;
      controller.abort();
    };
    // providers 只在 appconfig 首次 settle 后有值,onSuccess 由 view 缓存 — deps 列出
  }, [options, setState, startedRef, abortRef]);
}

export function useResumeOidc(options: UseResumeOidcOptions): ResumeOidcState {
  // 初始 state lazy initializer:同步检 sessionStorage 的 pending session,有就
  // initial resuming=true,这样第一帧 LoginView 就显 loading 而非账号密码登录
  // 表单(防 SSO 回调进 /login → useResumeOidc effect 还没跑那一帧的闪烁)。
  const [state, setState] = useState<ResumeOidcState>(() => {
    const pending = getPendingOidcLogin();
    if (pending && !isPendingExpired(pending)) {
      return { resuming: true, providerName: "SSO", error: null };
    }
    return { resuming: false, error: null };
  });
  const startedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  useResumeEffect(options, setState, startedRef, abortRef);
  return state;
}
