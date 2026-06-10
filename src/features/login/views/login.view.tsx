import { useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Shield } from "lucide-react";
import { useLoginMutation } from "@/features/login/mutations";
import { useSsoProviders } from "@/features/login/hooks/use-sso-providers.hook";
import { useStartOidcLogin } from "@/features/login/hooks/use-start-oidc.hook";
import { useResumeOidc } from "@/features/login/hooks/use-resume-oidc.hook";
import { useInviteInfo } from "@/features/login/hooks/use-invite-info.hook";
import { extractSafeErrorMessage } from "@/features/login/lib/sanitize-error";
import { useFinalizeLogin, writePendingInviteCode } from "@/features/login/lib/post-login-flow";
import {
  acknowledgeMigrationNotice,
  hasAcknowledgedMigrationNotice,
  resolveAegisRegisterUrl,
} from "@/features/login/lib/login-migration-notice";
import { LoginShell } from "@/features/login/components/login-shell";
import { DownloadButtons } from "@/features/login/components/download-buttons";
import { LoginMigrationModal } from "@/features/login/components/login-migration-modal";
import { appConfigQueryOptions } from "@/features/base/queries/appconfig.query";
import { parseRemoteBool } from "@/features/base/lib/parse-remote-bool";
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
 * **SSO 启用 + 有 provider** → 对齐老仓 `5ef5150f` SSO panel:
 *   - 顶部 breadcrumb "登录到 Octo · Web"(紫色圆点 + 文案,业务上下文锚)
 *   - 主 CTA + Shield icon(信任增强)
 *   - meta 行:Shield icon + "身份认证由 {provider} 提供 · 企业级安全"(tooltip)
 *   - meta 行下方 link "了解登录方式变更"→ Aegis migration modal(对齐上游 7de93ff1)
 *   - 下载按钮前分隔线"也可下载移动版"(主流 vs 备用分层)
 *   - **完全隐藏密码表单 + 底部链接**(SSO 模式下走 IdP,本地账号入口全无)
 *
 * **SSO 未启用**:本地账号密码 + 底部 3 链接 + 下载按钮(也带分隔线)
 *
 * UI 风格:本仓 tailwind tokens,业务结构对齐上游 Figma。
 */
export function LoginView({ redirect, inviteCode }: LoginViewProps) {
  const t = useT();
  const navigate = useNavigate();
  const loginMu = useLoginMutation();
  const { providers, primaryProvider, ssoModuleEnabled } = useSsoProviders();
  const { startOidc, loading: oidcStarting, error: oidcStartError } = useStartOidcLogin();
  const { data: inviteInfo } = useInviteInfo(inviteCode);
  const { data: appConfig } = useQuery(appConfigQueryOptions());
  const finalize = useFinalizeLogin(inviteCode, redirect);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [migrationOpen, setMigrationOpen] = useState(false);

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

  const hasSso = ssoModuleEnabled && !!primaryProvider;
  const ssoErrorText = oidcStartError ?? resumeError;
  const loginErrorText = loginMu.isError ? extractSafeErrorMessage(loginMu.error) : null;

  // Aegis migration notice 触发条件:SSO 模式 + appconfig 未 suppress + 本机未确认
  const suppressMigrationNotice = parseRemoteBool(appConfig?.suppress_login_migration_notice);
  const shouldShowMigrationNotice =
    hasSso && !suppressMigrationNotice && !hasAcknowledgedMigrationNotice();
  const aegisRegisterUrl = resolveAegisRegisterUrl(primaryProvider?.accountUrl);

  const startOidcNow = () => {
    if (!primaryProvider) return;
    writePendingInviteCode(inviteCode);
    void startOidc(primaryProvider);
  };

  const onStartOidc = () => {
    if (!primaryProvider) return;
    // 未确认 migration notice → 先弹,确认后再起 SSO(对齐上游 onPrimaryClick 守门)
    if (shouldShowMigrationNotice) {
      setMigrationOpen(true);
      return;
    }
    startOidcNow();
  };

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

  const breadcrumb = (
    <div className="mb-6 flex items-center gap-2 text-[12px] font-medium text-[#5b5be5]">
      <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[#5b5be5]" aria-hidden />
      <span>{t("login.login.breadcrumb", { values: { appName: "Octo" } })}</span>
    </div>
  );

  // ===================== SSO 模式 =====================
  if (hasSso) {
    return (
      <>
        <LoginShell topBanner={inviteBanner}>
          {breadcrumb}
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
              className="!flex h-[50px] w-full cursor-pointer items-center justify-center gap-2 rounded-[12px] !bg-[#5b5be5] text-[16px] font-semibold tracking-[0.3px] text-white hover:!bg-[#4848d4]"
              onClick={onStartOidc}
            >
              {!oidcStarting ? <Shield size={18} strokeWidth={2} /> : null}
              {oidcStarting ? t("login.login.ssoButton.loading") : t("login.login.ssoButton")}
            </Button>
            <div className="mt-2.5 flex items-center justify-center gap-2 text-[12px] text-[#8a8fa8]">
              <Shield size={12} className="shrink-0 text-[#5b5be5]" aria-hidden />
              <span
                className="cursor-help underline decoration-dotted underline-offset-2"
                title={t("login.login.ssoMetaBrandTitle", {
                  values: { provider: primaryProvider.name },
                })}
              >
                {t("login.login.ssoMetaPrefix")} {primaryProvider.name}{" "}
                {t("login.login.ssoMetaSuffix")}
              </span>
              <span className="text-[#b0b4c8]">·</span>
              <span>{t("login.login.ssoMetaTrust")}</span>
            </div>
            {/* Aegis migration notice trigger link(suppress 时隐) */}
            {!suppressMigrationNotice ? (
              <button
                type="button"
                onClick={() => setMigrationOpen(true)}
                className="mt-1.5 cursor-pointer self-center text-[12px] text-[#5b5be5] underline-offset-2 hover:underline"
              >
                {t("login.migration.link")}
              </button>
            ) : null}
          </div>

          {ssoErrorText ? <p className="mt-2 text-xs text-error">{ssoErrorText}</p> : null}

          <DownloadDivider />
          <DownloadButtons />
        </LoginShell>

        <LoginMigrationModal
          open={migrationOpen}
          registerUrl={aegisRegisterUrl}
          onContinue={() => {
            acknowledgeMigrationNotice();
            setMigrationOpen(false);
            // 已 acked,直接起 SSO(不再绕回 onStartOidc 守门)
            startOidcNow();
          }}
          onClose={() => setMigrationOpen(false)}
        />
      </>
    );
  }

  // ===================== 本地账号密码模式(SSO 未启用) =====================
  return (
    <LoginShell topBanner={inviteBanner}>
      {breadcrumb}
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

      {/* 底部链接(扫码登录 灰 / 没有账号？注册 / 忘记密码 — 后两者深色 weight 500)。
          spacing 对齐上游 1bf42ba2:mt-6 mb-2 让表单 → 链接 → 下载区有呼吸感 */}
      <div className="mt-6 mb-2 flex items-center justify-center text-sm">
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

      <DownloadDivider />
      <DownloadButtons />
    </LoginShell>
  );
}

/**
 * 下载按钮前分隔线 — 两侧细线 + 中心文案"也可下载移动版"(对齐上游 5ef5150f
 * 主流程 vs 下载备用的视觉分层)。
 */
function DownloadDivider() {
  const t = useT();
  return (
    <div className="mt-7 mb-3 flex items-center gap-3 text-[12px] text-[#8a8fa8]">
      <span className="h-px flex-1 bg-[#e4e6ef]" aria-hidden />
      <span className="shrink-0">{t("login.login.downloadDivider")}</span>
      <span className="h-px flex-1 bg-[#e4e6ef]" aria-hidden />
    </div>
  );
}
