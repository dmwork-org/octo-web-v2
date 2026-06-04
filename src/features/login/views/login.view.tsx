import { useCallback, useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { authActions } from "@/features/base/stores/auth";
import { useLoginMutation } from "@/features/login/mutations";
import { useSsoProviders } from "@/features/login/hooks/use-sso-providers.hook";
import { useStartOidcLogin } from "@/features/login/hooks/use-start-oidc.hook";
import { useResumeOidc } from "@/features/login/hooks/use-resume-oidc.hook";
import { extractSafeErrorMessage } from "@/features/login/lib/sanitize-error";
import { QrcodeView } from "@/features/login/views/qrcode.view";
import { RegisterView } from "@/features/login/views/register.view";
import { LoginType, type LoginType as LoginTypeT } from "@/features/login/lib/login-type";
import { Button } from "@/components/semi-bridge/button";
import type { LoginResp } from "@/features/base/api/endpoints/user.api";
import type { AuthUser } from "@/features/base/stores/auth";

interface LoginViewProps {
  redirect?: string;
}

function loginRespToAuthUser(resp: LoginResp): AuthUser {
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

/**
 * 登录页(对齐老仓 dmworklogin login.tsx LoginType 状态机):
 *   - `phone` — 默认:SSO 主路径 + 本地账号密码表单
 *   - `qrcode` — 扫码登录
 *   - `register` — 邮箱注册
 *   - `forgetPassword` — 块 4 加入
 *
 * **SSO 主路径**(`primaryProvider` 存在):
 *   - 主 CTA:`登录 / 注册`(`startOidc(primaryProvider)`)
 *   - `legacyPasswordLoginOff=1` 时隐藏本地密码表单(只走 SSO)
 *
 * **OIDC resume**:mount 时检 pending session,有则 poll authstatus。
 */
export function LoginView({ redirect }: LoginViewProps) {
  const navigate = useNavigate();
  const loginMu = useLoginMutation();
  const { providers, primaryProvider, legacyPasswordLoginOff } = useSsoProviders();
  const { startOidc, loading: oidcStarting, error: oidcStartError } = useStartOidcLogin();
  const [view, setView] = useState<LoginTypeT>(LoginType.Phone);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const onLoginSuccess = useCallback(
    (resp: LoginResp) => {
      authActions.signIn(resp.token, loginRespToAuthUser(resp));
      void navigate({ href: redirect ?? "/", replace: true });
    },
    [navigate, redirect],
  );

  const {
    resuming,
    providerName,
    error: resumeError,
  } = useResumeOidc({
    providers,
    onSuccess: onLoginSuccess,
  });

  // resume 中独立 loading banner — 不让用户看到表单(避免重复触发)
  if (resuming) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-base">
        <div className="flex w-80 flex-col items-center gap-3 rounded-lg border border-border-default bg-bg-surface p-8 shadow-sm">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          <p className="text-sm text-text-secondary">正在通过 {providerName} 登录…</p>
        </div>
      </div>
    );
  }

  // 二维码 view
  if (view === LoginType.Qrcode) {
    return <QrcodeView redirect={redirect} onSwitchToPassword={() => setView(LoginType.Phone)} />;
  }

  // 注册 view
  if (view === LoginType.Register) {
    return <RegisterView redirect={redirect} onBackToLogin={() => setView(LoginType.Phone)} />;
  }

  const onPasswordSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const { token, user } = await loginMu.mutateAsync({ username, password });
    authActions.signIn(token, user);
    void navigate({ href: redirect ?? "/", replace: true });
  };

  const showPasswordForm = !primaryProvider || !legacyPasswordLoginOff;
  const ssoErrorText = oidcStartError ?? resumeError;
  const loginErrorText = loginMu.isError ? extractSafeErrorMessage(loginMu.error) : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-base">
      <div className="flex w-80 flex-col gap-4 rounded-lg border border-border-default bg-bg-surface p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-text-primary">登录</h1>

        {/* SSO 主路径 — 有 provider 就显主 CTA */}
        {primaryProvider ? (
          <div className="flex flex-col gap-2">
            <Button
              type="primary"
              theme="solid"
              loading={oidcStarting}
              className="w-full"
              onClick={() => void startOidc(primaryProvider)}
            >
              {oidcStarting ? "跳转中…" : "登录 / 注册"}
            </Button>
            <p className="text-center text-xs text-text-tertiary">
              已有账号将自动登录，新用户将自动注册
            </p>
            <p
              className="text-center text-[11px] text-text-tertiary"
              title={`由 ${primaryProvider.name} 提供`}
            >
              由 {primaryProvider.name} 提供
            </p>
          </div>
        ) : null}

        {ssoErrorText ? <p className="text-xs text-error">{ssoErrorText}</p> : null}

        {/* SSO + 本地表单分隔 */}
        {primaryProvider && showPasswordForm ? (
          <div className="flex items-center gap-2 text-[11px] text-text-tertiary">
            <span className="flex-1 border-t border-border-subtle" />
            <span>或</span>
            <span className="flex-1 border-t border-border-subtle" />
          </div>
        ) : null}

        {/* 本地密码表单 */}
        {showPasswordForm ? (
          <form onSubmit={onPasswordSubmit} aria-label="login form" className="flex flex-col gap-3">
            <label className="block text-sm text-text-secondary">
              用户名
              <input
                type="text"
                className="mt-1 w-full rounded border border-border-default bg-bg-surface px-2 py-1.5 text-text-primary"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
              />
            </label>
            <label className="block text-sm text-text-secondary">
              密码
              <input
                type="password"
                className="mt-1 w-full rounded border border-border-default bg-bg-surface px-2 py-1.5 text-text-primary"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </label>
            {loginErrorText ? <p className="text-xs text-error">{loginErrorText}</p> : null}
            <Button
              htmlType="submit"
              type="primary"
              theme="solid"
              loading={loginMu.isPending}
              className="w-full"
            >
              {loginMu.isPending ? "登录中…" : "登录"}
            </Button>
          </form>
        ) : null}

        {/* 底部链接(扫码 / 注册 / 找回密码 块 4 加入) */}
        <div className="flex justify-between text-xs text-text-tertiary">
          <button
            type="button"
            onClick={() => setView(LoginType.Qrcode)}
            className="hover:text-text-primary hover:underline"
          >
            扫码登录
          </button>
          <button
            type="button"
            onClick={() => setView(LoginType.Register)}
            className="hover:text-text-primary hover:underline"
          >
            没有账号？注册
          </button>
        </div>
      </div>
    </div>
  );
}
