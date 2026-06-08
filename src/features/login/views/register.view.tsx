import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useRegisterByEmailMutation, useSendEmailCodeMutation } from "@/features/login/mutations";
import { isValidEmail } from "@/features/login/lib/email-validator";
import { extractSafeErrorMessage } from "@/features/login/lib/sanitize-error";
import { validatePassword } from "@/features/login/lib/password-strength";
import { useFinalizeLogin } from "@/features/login/lib/post-login-flow";
import { useCodeCountdown } from "@/features/login/hooks/use-code-countdown.hook";
import { LoginShell } from "@/features/login/components/login-shell";
import { LoginInput } from "@/features/login/components/login-input";
import { SendCodeButton } from "@/features/login/components/send-code-button";
import { LoginPrimaryButton } from "@/features/login/components/login-primary-button";
import { PasswordStrengthMeter } from "@/features/login/components/password-strength-meter";
import { toast } from "@/components/semi-bridge/toast";
import { useT } from "@/lib/i18n/use-t";
import { t as tInstance } from "@/lib/i18n/instance";

interface RegisterViewProps {
  redirect?: string;
  /** URL `?invite_code=` 透传 — 注册成功自动 join space。 */
  inviteCode?: string;
}

/**
 * 邮箱注册视图 — 独立路由 `/register`,1:1 对齐老仓 dmworklogin login.tsx
 * LoginType.register 区块(行 497-583):
 *
 * 字段顺序(逐字 placeholder):
 *  1. 邮箱
 *  2. 邮箱验证码(同 row + 发送按钮,code_type=0)
 *  3. 昵称
 *  4. 密码 + PasswordStrengthMeter
 *  5. 确认密码
 *  6. 主按钮 "注册"
 *
 * 校验错误统一 toast.error(对齐老仓 Toast.error);文案逐字老仓:
 *  - "请先输入正确的邮箱地址！" / "请输入正确的邮箱地址！"
 *  - "邮箱验证码不能为空！"
 *  - "昵称不能为空！"
 *  - validatePassword 返错文案
 *  - "两次密码输入不一致！"
 *
 * 底部 "已有账号？登录" → navigate 回 /login(search 透传)。
 */
export function RegisterView({ redirect, inviteCode }: RegisterViewProps) {
  const t = useT();
  const navigate = useNavigate();
  const sendCodeMu = useSendEmailCodeMutation();
  const registerMu = useRegisterByEmailMutation();
  const finalize = useFinalizeLogin(inviteCode, redirect);
  const countdown = useCodeCountdown();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const sendCode = async () => {
    if (!isValidEmail(email)) {
      toast.error(tInstance("login.validation.emailInvalidBeforeSend"));
      throw new Error("invalid email");
    }
    try {
      await sendCodeMu.mutateAsync({ email, codeType: 0 });
      countdown.start(60);
    } catch (e) {
      toast.error(extractSafeErrorMessage(e));
      throw e;
    }
  };

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isValidEmail(email)) return toast.error(tInstance("login.validation.emailInvalid"));
    if (!code) return toast.error(tInstance("login.validation.emailCodeRequired"));
    if (!name) return toast.error(tInstance("login.validation.nicknameRequired"));
    const pwdErr = validatePassword(password);
    if (pwdErr) return toast.error(pwdErr);
    if (password !== confirm) return toast.error(tInstance("login.validation.passwordMismatch"));
    try {
      const resp = await registerMu.mutateAsync({ email, code, name, password });
      void finalize(resp);
    } catch (err) {
      toast.error(extractSafeErrorMessage(err));
    }
  };

  const backToLogin = () => {
    void navigate({
      to: "/login",
      search: {
        ...(redirect ? { redirect } : {}),
        ...(inviteCode ? { invite_code: inviteCode } : {}),
      },
    });
  };

  return (
    <LoginShell>
      <div className="mb-2.5 text-left text-[30px] leading-[1.25] font-bold tracking-[-0.01em] text-[#1a1a2e]">
        {t("login.register.title")}
      </div>
      <div className="mb-7 text-left text-sm text-[#8a8fa8]">
        {t("login.register.sub", { values: { appName: "Octo" } })}
      </div>

      <form onSubmit={onSubmit} aria-label="register form" className="flex flex-col">
        <LoginInput
          type="email"
          name="reg-email"
          autoComplete="email"
          placeholder={t("login.form.email")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        {/* 验证码 row — 对齐老仓 .wk-login-content-form-code-row(flex gap 8 + mb 14) */}
        <div className="mb-3.5 flex items-center gap-2">
          <LoginInput
            type="text"
            name="reg-code"
            autoComplete="one-time-code"
            inputMode="numeric"
            maxLength={6}
            placeholder={t("login.form.emailCode")}
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
          type="text"
          name="reg-name"
          autoComplete="name"
          placeholder={t("login.form.nickname")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={20}
        />

        <LoginInput
          type="password"
          name="reg-password"
          autoComplete="off"
          placeholder={t("login.form.password")}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <PasswordStrengthMeter password={password} />

        <LoginInput
          type="password"
          name="reg-confirm-password"
          autoComplete="off"
          placeholder={t("login.form.confirmPassword")}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />

        <div className="mt-5">
          <LoginPrimaryButton htmlType="submit" loading={registerMu.isPending}>
            {registerMu.isPending ? t("login.register.button.loading") : t("login.register.button")}
          </LoginPrimaryButton>
        </div>

        {/* 底部链接(.wk-login-content-form-others 单链接) */}
        <div className="mt-5 flex justify-center">
          <button
            type="button"
            onClick={backToLogin}
            className="cursor-pointer text-[14px] font-medium text-[#1C1C23] transition-opacity hover:opacity-75"
          >
            {t("login.register.hasAccount")}
          </button>
        </div>
      </form>
    </LoginShell>
  );
}
