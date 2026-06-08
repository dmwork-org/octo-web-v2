import { useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useLoginMutation } from "@/features/login/mutations";
import { useSsoProviders } from "@/features/login/hooks/use-sso-providers.hook";
import { useStartOidcLogin } from "@/features/login/hooks/use-start-oidc.hook";
import { useResumeOidc } from "@/features/login/hooks/use-resume-oidc.hook";
import { useInviteInfo } from "@/features/login/hooks/use-invite-info.hook";
import { extractSafeErrorMessage } from "@/features/login/lib/sanitize-error";
import { useFinalizeLogin, writePendingInviteCode } from "@/features/login/lib/post-login-flow";
import { LoginShell } from "@/features/login/components/login-shell";
import { DownloadButtons } from "@/features/login/components/download-buttons";
import { Button } from "@/components/semi-bridge/button";
import { useT } from "@/lib/i18n/use-t";

interface LoginViewProps {
  redirect?: string;
  /** URL `?invite_code=` — 显 banner + 登录成功自动 join space。 */
  inviteCode?: string;
}

/**
 * 登录页 — 仅 phone(账号密码 / SSO)。其他 3 种 view 已拆独立路由:
 *   /qrcode / /register / /forgetpassword
 *
 * **SSO 启用 + 有 provider** → 1:1 对齐老仓 login.tsx 行 416-457:
 *   - 主 CTA "登录 / 注册"(紫色 #5b5be5)
 *   - meta 行:helper + 信任锚 "由 {provider} 提供"
 *   - 下载按钮
 *   - **完全隐藏密码表单 + 底部链接**(老仓硬编码 `{false && <LegacyPasswordSection />}`,
 *     SSO 模式下走 IdP,本地账号入口全无)
 *
 * **SSO 未启用**(env=false 或无 provider):本地账号密码登录 + 底部 3 链接
 * (扫码 / 没有账号？注册 / 忘记密码)+ 下载按钮。
 */
export function LoginView({ redirect, inviteCode }: LoginViewProps) {
  const t = useT();
  const navigate = useNavigate();
  const loginMu = useLoginMutation();
  const { providers, primaryProvider, ssoModuleEnabled } = useSsoProviders();
  const { startOidc, loading: oidcStarting, error: oidcStartError } = useStartOidcLogin();
  const { data: inviteInfo } = useInviteInfo(inviteCode);
  const finalize = useFinalizeLogin(inviteCode, redirect);
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
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#5b5be5] border-t-transparent" />
          <p className="text-sm text-[#8a8fa8]">
            {t("login.oidc.resuming", { values: { provider: providerName ?? "SSO" } })}
          </p>
        </div>
      </LoginShell>
    );
  }

  const onPasswordSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const { raw } = await loginMu.mutateAsync({ username, password });
    void finalize(raw);
  };

  // SSO 启用 + 有 provider → 整体走 SSO 路径,密码表单 + 底部链接全隐
  // (对齐老仓 login.tsx 行 447-457 — legacyPasswordLoginOff flag 期间硬隐)
  const hasSso = ssoModuleEnabled && !!primaryProvider;
  const ssoErrorText = oidcStartError ?? resumeError;
  const loginErrorText = loginMu.isError ? extractSafeErrorMessage(loginMu.error) : null;

  const onStartOidc = () => {
    if (!primaryProvider) return;
    writePendingInviteCode(inviteCode);
    void startOidc(primaryProvider);
  };

  // 子路由 navigate 时透传 redirect + invite_code(供子页登录成功后继续走 finalize)
  const subSearch: { redirect?: string; invite_code?: string } = {};
  if (redirect) subSearch.redirect = redirect;
  if (inviteCode) subSearch.invite_code = inviteCode;

  const onClickForget = () => void navigate({ to: "/forgetpassword" });

  const inviteBanner = inviteInfo ? (
    <div className="rounded-[10px] border border-[#1C1C23]/15 bg-[#1C1C23]/[0.06] px-4 py-3 text-[14px] leading-[1.6] text-[#1C1C23]">
      <div>
        {t("login.login.invite")} <strong>{inviteInfo.space_name}</strong>
      </div>
      {typeof inviteInfo.member_count === "number" ? (
        <div>
          {typeof inviteInfo.max_users === "number" && inviteInfo.max_users > 0
            ? t("login.login.memberCountWithMax", {
                values: { count: inviteInfo.member_count, max: inviteInfo.max_users },
              })
            : t("login.login.memberCount", { values: { count: inviteInfo.member_count } })}
        </div>
      ) : null}
    </div>
  ) : null;

  // ===================== SSO 模式 =====================
  if (hasSso) {
    return (
      <LoginShell topBanner={inviteBanner}>
        <div className="mb-2.5 text-left text-[30px] leading-[1.25] font-bold tracking-[-0.01em] text-[#1a1a2e]">
          {t("login.login.welcome")}
        </div>
        <div className="mb-7 text-left text-sm text-[#8a8fa8]">
          {t("login.login.ssoSub", { values: { provider: primaryProvider.name, appName: "Octo" } })}
        </div>

        <div className="flex flex-col">
          <Button
            type="primary"
            theme="solid"
            loading={oidcStarting}
            className="h-[50px] w-full cursor-pointer rounded-[12px] !bg-[#5b5be5] text-[16px] font-semibold tracking-[0.3px] text-white hover:!bg-[#4848d4]"
            onClick={onStartOidc}
          >
            {oidcStarting ? t("login.login.ssoButton.loading") : t("login.login.passwordCtaLink")}
          </Button>
          <div className="mt-2.5 flex items-center justify-center gap-2 text-[12px] text-[#8a8fa8]">
            <span>{t("login.login.ssoAutoCreate")}</span>
            <span className="text-[#b0b4c8]">·</span>
            <span
              className="cursor-help underline decoration-dotted underline-offset-2"
              title={t("login.login.ssoMetaBrandTitle", {
                values: { provider: primaryProvider.name },
              })}
            >
              {t("login.login.ssoMetaPrefix")} {primaryProvider.name}{" "}
              {t("login.login.ssoMetaSuffix")}
            </span>
          </div>
        </div>

        {ssoErrorText ? <p className="mt-2 text-xs text-error">{ssoErrorText}</p> : null}

        <DownloadButtons />
      </LoginShell>
    );
  }

  // ===================== 本地账号密码模式(SSO 未启用) =====================
  return (
    <LoginShell topBanner={inviteBanner}>
      <div className="mb-2.5 text-left text-[30px] leading-[1.25] font-bold tracking-[-0.01em] text-[#1a1a2e]">
        {t("login.login.welcome")}
      </div>
      <div className="mb-7 text-left text-sm text-[#8a8fa8]">{t("login.login.defaultSub")}</div>

      <form onSubmit={onPasswordSubmit} aria-label="login form" className="flex flex-col gap-0">
        <input
          type="text"
          name="username"
          placeholder={t("login.form.email")}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          autoComplete="username"
          className="mb-3.5 h-[46px] w-full rounded-[10px] border-[1.5px] border-[#e4e6ef] bg-[#fafbfc] px-4 text-[15px] text-[#1a1a2e] transition-all outline-none placeholder:text-[#b0b4c8] focus:border-[#1C1C23] focus:bg-white focus:shadow-[0_0_0_3px_rgba(28,28,35,0.12)]"
        />
        <input
          type="password"
          name="password"
          placeholder={t("login.form.password")}
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
          className="mt-2 h-[46px] w-full cursor-pointer rounded-[10px] !bg-brand text-[15px] font-semibold tracking-[0.3px] text-white hover:!bg-brand-hover"
        >
          {loginMu.isPending ? t("login.login.button.loading") : t("login.login.button")}
        </Button>
      </form>

      {/* 底部链接(扫码登录 灰 / 没有账号？注册 / 忘记密码 — 后两者深色 weight 500) */}
      <div className="mt-5 flex items-center justify-center text-sm">
        <button
          type="button"
          onClick={() => void navigate({ to: "/qrcode", search: subSearch })}
          className="cursor-pointer text-[#8a8fa8] transition-colors hover:text-[#1C1C23]"
        >
          {t("login.login.scanLogin")}
        </button>
        <span className="mx-4 h-3 w-px bg-[#e4e6ef]" />
        <button
          type="button"
          onClick={() => void navigate({ to: "/register", search: subSearch })}
          className="cursor-pointer font-medium text-[#1C1C23] transition-opacity hover:opacity-75"
        >
          {t("login.login.noAccountRegister")}
        </button>
        <span className="mx-4 h-3 w-px bg-[#e4e6ef]" />
        <button
          type="button"
          onClick={onClickForget}
          className="cursor-pointer font-medium text-[#1C1C23] transition-opacity hover:opacity-75"
        >
          {t("login.login.forgotPassword")}
        </button>
      </div>

      <DownloadButtons />
    </LoginShell>
  );
}
