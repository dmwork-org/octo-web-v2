import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useResetPasswordMutation, useSendEmailCodeMutation } from "@/features/login/mutations";
import { isValidEmail } from "@/features/login/lib/email-validator";
import { extractSafeErrorMessage } from "@/features/login/lib/sanitize-error";
import { validatePassword } from "@/features/login/lib/password-strength";
import { useCodeCountdown } from "@/features/login/hooks/use-code-countdown.hook";
import { useSsoProviders } from "@/features/login/hooks/use-sso-providers.hook";
import { LoginShell } from "@/features/login/components/login-shell";
import { LoginInput } from "@/features/login/components/login-input";
import { SendCodeButton } from "@/features/login/components/send-code-button";
import { LoginPrimaryButton } from "@/features/login/components/login-primary-button";
import { PasswordStrengthMeter } from "@/features/login/components/password-strength-meter";
import { toast } from "@/components/semi-bridge/toast";

/**
 * 找回密码视图 — 独立路由 `/forgetpassword`,1:1 对齐老仓 dmworklogin login.tsx
 * LoginType.forgetPassword 区块(行 584-664):
 *
 * 字段顺序(逐字 placeholder):
 *  1. 注册邮箱
 *  2. 验证码(同 row + 发送按钮,**code_type=2** 跟注册的 0 区分)
 *  3. 新密码 + PasswordStrengthMeter
 *  4. 确认新密码
 *  5. 主按钮 "重置密码"
 *
 * SSO 提示(老仓行 587-599):当 ssoProvider.resetPasswordUrl 非空时,顶部显
 * "企业统一认证账号请前往 {provider.name} 账户中心 修改密码。"(account-url 链接)
 *
 * 校验错误统一 toast.error(对齐老仓 Toast.error)。
 *
 * 成功后:`toast.success("密码重置成功，请登录")` + 立即跳 /login
 * (1:1 对齐老仓 login.tsx 行 648-650;**无独立成功页**)。
 */
export function ForgetPasswordView() {
  const navigate = useNavigate();
  const sendCodeMu = useSendEmailCodeMutation();
  const resetMu = useResetPasswordMutation();
  const { primaryProvider, ssoModuleEnabled } = useSsoProviders();
  const countdown = useCodeCountdown();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const sendCode = async () => {
    if (!isValidEmail(email)) {
      toast.error("请输入正确的邮箱地址！");
      throw new Error("invalid email");
    }
    try {
      await sendCodeMu.mutateAsync({ email, codeType: 2 });
      countdown.start(60);
    } catch (e) {
      toast.error(extractSafeErrorMessage(e));
      throw e;
    }
  };

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isValidEmail(email)) return toast.error("请输入正确的邮箱地址！");
    if (!code) return toast.error("验证码不能为空！");
    const pwdErr = validatePassword(newPassword);
    if (pwdErr) return toast.error(pwdErr);
    if (newPassword !== confirm) return toast.error("两次密码输入不一致！");
    try {
      await resetMu.mutateAsync({ email, code, new_password: newPassword });
      // 老仓行为(login.tsx 行 648-650):toast.success + 立即切回登录页,
      // 不显独立成功页。
      toast.success("密码重置成功，请登录");
      void navigate({ to: "/login" });
    } catch (err) {
      toast.error(extractSafeErrorMessage(err));
    }
  };

  const backToLogin = () => void navigate({ to: "/login" });

  // SSO 启用 + 该 provider 暴露了 resetPasswordUrl → 顶部显提示
  const ssoResetHint =
    ssoModuleEnabled && primaryProvider?.resetPasswordUrl ? (
      <div className="mb-4 rounded-[8px] border border-[rgba(91,91,229,0.2)] bg-[rgba(91,91,229,0.06)] px-3 py-2.5 text-[13px] leading-[1.6] text-[rgba(0,0,0,0.7)]">
        企业统一认证账号请前往{" "}
        <a
          href={primaryProvider.resetPasswordUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mx-1 font-medium text-[#5b5be5] no-underline hover:underline"
        >
          {primaryProvider.name} 账户中心
        </a>{" "}
        修改密码。
      </div>
    ) : null;

  return (
    <LoginShell>
      <div className="mb-2.5 text-left text-[30px] leading-[1.25] font-bold tracking-[-0.01em] text-[#1a1a2e]">
        重置密码
      </div>
      <div className="mb-7 text-left text-sm text-[#8a8fa8]">输入注册邮箱，我们将发送验证码</div>

      {ssoResetHint}

      <form onSubmit={onSubmit} aria-label="forget password form" className="flex flex-col">
        <LoginInput
          type="email"
          name="forget-email"
          autoComplete="email"
          placeholder="注册邮箱"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <div className="mb-3.5 flex items-center gap-2">
          <LoginInput
            type="text"
            name="forget-code"
            autoComplete="one-time-code"
            inputMode="numeric"
            maxLength={6}
            placeholder="验证码"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            noMargin
          />
          <SendCodeButton
            countdown={countdown.count}
            onSend={sendCode}
            disabled={!isValidEmail(email)}
          />
        </div>

        <LoginInput
          type="password"
          name="forget-new-pwd"
          autoComplete="off"
          placeholder="新密码"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />

        <PasswordStrengthMeter password={newPassword} />

        <LoginInput
          type="password"
          name="forget-confirm-pwd"
          autoComplete="off"
          placeholder="确认新密码"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />

        <div className="mt-5">
          <LoginPrimaryButton htmlType="submit" loading={resetMu.isPending}>
            {resetMu.isPending ? "重置中…" : "重置密码"}
          </LoginPrimaryButton>
        </div>

        <div className="mt-5 flex justify-center">
          <button
            type="button"
            onClick={backToLogin}
            className="cursor-pointer text-[14px] font-medium text-[#1C1C23] transition-opacity hover:opacity-75"
          >
            返回登录
          </button>
        </div>
      </form>
    </LoginShell>
  );
}
