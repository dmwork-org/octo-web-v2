import { useState, type FormEvent } from "react";
import { useLoginMutation } from "@/features/login/mutations";
import { useSsoProviders } from "@/features/login/hooks/use-sso-providers.hook";
import { useStartOidcLogin } from "@/features/login/hooks/use-start-oidc.hook";
import { useResumeOidc } from "@/features/login/hooks/use-resume-oidc.hook";
import { useInviteInfo } from "@/features/login/hooks/use-invite-info.hook";
import { extractSafeErrorMessage } from "@/features/login/lib/sanitize-error";
import { useFinalizeLogin, writePendingInviteCode } from "@/features/login/lib/post-login-flow";
import { QrcodeView } from "@/features/login/views/qrcode.view";
import { RegisterView } from "@/features/login/views/register.view";
import { ForgetPasswordView } from "@/features/login/views/forget-password.view";
import { LoginType, type LoginType as LoginTypeT } from "@/features/login/lib/login-type";
import { LoginShell } from "@/features/login/components/login-shell";
import { Button } from "@/components/semi-bridge/button";

interface LoginViewProps {
  redirect?: string;
  /** URL `?invite_code=` — 显 banner + 登录成功自动 join space。 */
  inviteCode?: string;
}

/**
 * 登录页(对齐老仓 dmworklogin login.tsx 1:1):
 *
 * **两栏布局**(LoginShell):
 *   左 55% — brand panel(紫蓝渐变 + logo + headline + 聊天气泡装饰)
 *   右 45% — form panel(slogan + view 切换)
 *
 * **View 切换**(LoginType 4 态):phone / qrcode / register / forgetPassword
 *
 * **SSO 双层 gate**(对齐老仓 ENTERPRISE_SSO_ENABLED + hasSsoProvider):
 *  1. build-time env `VITE_ENABLE_ENTERPRISE_SSO === 'true'`(useSsoProviders 内部 gate)
 *  2. runtime appconfig.oidc_providers 非空 → primaryProvider 存在
 *  两者都满足 → 显主 CTA + slogan-sub 文案改成"使用手机号或邮箱即可登录"
 *  + legacyPasswordLoginOff=1 进一步隐藏密码表单
 */
export function LoginView({ redirect, inviteCode }: LoginViewProps) {
  const loginMu = useLoginMutation();
  const { providers, primaryProvider, legacyPasswordLoginOff, ssoModuleEnabled } =
    useSsoProviders();
  const { startOidc, loading: oidcStarting, error: oidcStartError } = useStartOidcLogin();
  const { data: inviteInfo } = useInviteInfo(inviteCode);
  const finalize = useFinalizeLogin(inviteCode, redirect);
  const [view, setView] = useState<LoginTypeT>(LoginType.Phone);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const {
    resuming,
    providerName,
    error: resumeError,
  } = useResumeOidc({
    providers,
    onSuccess: (resp) => void finalize(resp),
  });

  if (resuming) {
    return (
      <LoginShell>
        <div className="flex flex-col items-center gap-3 py-10">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#7A5CFF] border-t-transparent" />
          <p className="text-sm text-[#8a8fa8]">正在通过 {providerName} 登录…</p>
        </div>
      </LoginShell>
    );
  }
  if (view === LoginType.Qrcode) {
    return (
      <QrcodeView
        redirect={redirect}
        inviteCode={inviteCode}
        onSwitchToPassword={() => setView(LoginType.Phone)}
      />
    );
  }
  if (view === LoginType.Register) {
    return (
      <RegisterView
        redirect={redirect}
        inviteCode={inviteCode}
        onBackToLogin={() => setView(LoginType.Phone)}
      />
    );
  }
  if (view === LoginType.ForgetPassword) {
    return <ForgetPasswordView onBackToLogin={() => setView(LoginType.Phone)} />;
  }

  const onPasswordSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const { raw } = await loginMu.mutateAsync({ username, password });
    void finalize(raw);
  };

  // 双层 gate:env 启用 + 后端下发 provider
  const hasSso = ssoModuleEnabled && !!primaryProvider;
  const showPasswordForm = !hasSso || !legacyPasswordLoginOff;
  const ssoErrorText = oidcStartError ?? resumeError;
  const loginErrorText = loginMu.isError ? extractSafeErrorMessage(loginMu.error) : null;

  const onStartOidc = () => {
    if (!primaryProvider) return;
    writePendingInviteCode(inviteCode);
    void startOidc(primaryProvider);
  };

  const onClickForget = () => {
    if (primaryProvider?.resetPasswordUrl) {
      window.open(primaryProvider.resetPasswordUrl, "_blank", "noopener,noreferrer");
      return;
    }
    setView(LoginType.ForgetPassword);
  };

  const inviteBanner = inviteInfo ? (
    <div className="rounded-md border border-[#7A5CFF]/20 bg-[#7A5CFF]/[0.06] px-3 py-2 text-xs text-[#1a1a2e]">
      你被邀请加入 <strong>{inviteInfo.space_name}</strong>
      {typeof inviteInfo.member_count === "number" && typeof inviteInfo.max_users === "number" ? (
        <span className="text-[#8a8fa8]">
          {" "}
          ({inviteInfo.member_count}/{inviteInfo.max_users} 人)
        </span>
      ) : null}
    </div>
  ) : null;

  return (
    <LoginShell topBanner={inviteBanner}>
      {/* Slogan + sub(对齐老仓 .wk-login-content-slogan / -sub) */}
      <div className="mb-2.5 text-left text-[30px] leading-[1.25] font-bold tracking-tight text-[#1a1a2e]">
        欢迎回来
      </div>
      <div className="mb-7 text-left text-sm text-[#8a8fa8]">
        {hasSso ? "使用手机号或邮箱即可登录" : "登录你的账号以继续"}
      </div>

      {/* SSO 主路径 */}
      {hasSso ? (
        <div className="flex flex-col">
          <Button
            type="primary"
            theme="solid"
            loading={oidcStarting}
            className="h-[46px] w-full rounded-[10px] !bg-brand text-[15px] font-semibold tracking-wide text-white hover:!bg-brand-hover"
            onClick={onStartOidc}
          >
            {oidcStarting ? "跳转中…" : "登录 / 注册"}
          </Button>
          {/* meta + trust 同一行 · 分隔(对齐老仓 .wk-login-content-sso-meta) */}
          <div className="mt-2.5 flex items-center justify-center gap-2 text-[12px] text-[#8a8fa8]">
            <span>已有账号将自动登录，新用户将自动注册</span>
            <span className="text-[#b0b4c8]">·</span>
            <span
              className="cursor-help underline decoration-dotted underline-offset-2"
              title={`${primaryProvider!.name} 是 Mininglamp 统一身份服务，登录后可在所有 Mininglamp 产品中通用`}
            >
              由 {primaryProvider!.name} 提供
            </span>
          </div>
        </div>
      ) : null}

      {ssoErrorText ? <p className="mt-2 text-xs text-error">{ssoErrorText}</p> : null}

      {/* SSO + 本地表单分隔 */}
      {hasSso && showPasswordForm ? (
        <div className="my-6 flex items-center gap-2 text-[11px] text-[#b0b4c8]">
          <span className="flex-1 border-t border-[#e4e6ef]" />
          <span>或</span>
          <span className="flex-1 border-t border-[#e4e6ef]" />
        </div>
      ) : null}

      {/* 本地密码表单(对齐老仓 .wk-login-content-form input 样式) */}
      {showPasswordForm ? (
        <form onSubmit={onPasswordSubmit} aria-label="login form" className="flex flex-col gap-0">
          <input
            type="text"
            name="username"
            placeholder="邮箱或用户名"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoComplete="username"
            className="mb-3.5 h-[46px] w-full rounded-[10px] border-[1.5px] border-[#e4e6ef] bg-[#fafbfc] px-4 text-[15px] text-[#1a1a2e] transition-all outline-none placeholder:text-[#b0b4c8] focus:border-[#1C1C23] focus:bg-white focus:shadow-[0_0_0_3px_rgba(28,28,35,0.12)]"
          />
          <input
            type="password"
            name="password"
            placeholder="密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="mb-3.5 h-[46px] w-full rounded-[10px] border-[1.5px] border-[#e4e6ef] bg-[#fafbfc] px-4 text-[15px] text-[#1a1a2e] transition-all outline-none placeholder:text-[#b0b4c8] focus:border-[#1C1C23] focus:bg-white focus:shadow-[0_0_0_3px_rgba(28,28,35,0.12)]"
          />
          {loginErrorText ? <p className="mb-2 text-xs text-error">{loginErrorText}</p> : null}
          <Button
            htmlType="submit"
            type="primary"
            theme="solid"
            loading={loginMu.isPending}
            className="mt-2 h-[46px] w-full rounded-[10px] !bg-brand text-[15px] font-semibold tracking-wide text-white hover:!bg-brand-hover"
          >
            {loginMu.isPending ? "登录中…" : "登录"}
          </Button>
        </form>
      ) : null}

      {/* 底部链接(扫码 | 注册 | 忘记密码,| 分隔对齐老仓 .wk-login-content-form-others) */}
      <div className="mt-5 flex items-center justify-center text-sm text-[#8a8fa8]">
        <button
          type="button"
          onClick={() => setView(LoginType.Qrcode)}
          className="transition-colors hover:text-[#1C1C23]"
        >
          扫码登录
        </button>
        <span className="mx-4 h-3 w-px bg-[#e4e6ef]" />
        <button
          type="button"
          onClick={() => setView(LoginType.Register)}
          className="font-medium text-[#1C1C23] transition-opacity hover:opacity-75"
        >
          注册
        </button>
        <span className="mx-4 h-3 w-px bg-[#e4e6ef]" />
        <button
          type="button"
          onClick={onClickForget}
          className="transition-colors hover:text-[#1C1C23]"
        >
          忘记密码
        </button>
      </div>
    </LoginShell>
  );
}
