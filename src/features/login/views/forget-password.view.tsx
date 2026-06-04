import { useCallback, useState } from "react";
import { useResetPasswordMutation, useSendEmailCodeMutation } from "@/features/login/mutations";
import { isValidEmail } from "@/features/login/lib/email-validator";
import { extractSafeErrorMessage } from "@/features/login/lib/sanitize-error";
import { CodeCountdownButton } from "@/features/login/components/code-countdown-button";
import { PasswordStrengthIndicator } from "@/features/login/components/password-strength-indicator";
import { LoginShell } from "@/features/login/components/login-shell";
import { Button } from "@/components/semi-bridge/button";

interface ForgetPasswordViewProps {
  onBackToLogin?: () => void;
}

const INPUT_CLS =
  "h-[46px] w-full rounded-[10px] border-[1.5px] border-[#e4e6ef] bg-[#fafbfc] px-4 text-[15px] text-[#1a1a2e] transition-all outline-none placeholder:text-[#b0b4c8] focus:border-[#1C1C23] focus:bg-white focus:shadow-[0_0_0_3px_rgba(28,28,35,0.12)]";

/**
 * 找回密码视图(对齐老仓 dmworklogin login.tsx LoginType.forgetPassword 区块):
 * - 邮箱(isValidEmail 实时校验)
 * - 60s 倒计时验证码(code_type=2,**跟注册的 0 不同**)
 * - 新密码 + 确认密码(+ 强度指示)
 */
export function ForgetPasswordView({ onBackToLogin }: ForgetPasswordViewProps) {
  const sendCodeMu = useSendEmailCodeMutation();
  const resetMu = useResetPasswordMutation();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const emailValid = isValidEmail(email);

  const sendCode = useCallback(async () => {
    if (!emailValid) {
      setInlineError("请输入有效邮箱");
      throw new Error("invalid email");
    }
    setInlineError(null);
    try {
      await sendCodeMu.mutateAsync({ email, codeType: 2 });
    } catch (e) {
      setInlineError(extractSafeErrorMessage(e));
      throw e;
    }
  }, [email, emailValid, sendCodeMu]);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setInlineError(null);
    if (!emailValid) return setInlineError("请输入有效邮箱");
    if (!code) return setInlineError("请输入验证码");
    if (newPassword.length < 6) return setInlineError("密码至少 6 位");
    if (newPassword !== confirm) return setInlineError("两次密码不一致");
    try {
      await resetMu.mutateAsync({ email, code, new_password: newPassword });
      setDone(true);
    } catch (err) {
      setInlineError(extractSafeErrorMessage(err));
    }
  };

  if (done) {
    return (
      <LoginShell>
        <div className="flex flex-col items-center gap-4 py-10">
          <p className="text-base text-success">密码已重置,请使用新密码登录</p>
          {onBackToLogin ? (
            <Button
              type="primary"
              theme="solid"
              onClick={onBackToLogin}
              className="h-[46px] w-full rounded-[10px] !bg-brand text-[15px] font-semibold tracking-wide text-white hover:!bg-brand-hover"
            >
              返回登录
            </Button>
          ) : null}
        </div>
      </LoginShell>
    );
  }

  return (
    <LoginShell>
      <div className="mb-2.5 text-left text-[30px] leading-[1.25] font-bold tracking-tight text-[#1a1a2e]">
        找回密码
      </div>
      <div className="mb-7 text-left text-sm text-[#8a8fa8]">通过邮箱验证码重置密码</div>

      <form onSubmit={onSubmit} aria-label="forget password form" className="flex flex-col gap-3.5">
        <input
          type="email"
          placeholder="邮箱"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
          className={INPUT_CLS}
        />
        <div className="flex gap-2">
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            placeholder="6 位验证码"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            required
            className={`${INPUT_CLS} flex-1 tracking-widest`}
          />
          <CodeCountdownButton onSend={sendCode} disabled={!emailValid} />
        </div>
        <input
          type="password"
          placeholder="新密码(至少 6 位)"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password"
          required
          className={INPUT_CLS}
        />
        <PasswordStrengthIndicator password={newPassword} />
        <input
          type="password"
          placeholder="确认新密码"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          required
          className={INPUT_CLS}
        />

        {inlineError ? <p className="text-xs text-error">{inlineError}</p> : null}

        <Button
          htmlType="submit"
          type="primary"
          theme="solid"
          loading={resetMu.isPending}
          className="mt-2 h-[46px] w-full rounded-[10px] !bg-brand text-[15px] font-semibold tracking-wide text-white hover:!bg-brand-hover"
        >
          {resetMu.isPending ? "重置中…" : "重置密码"}
        </Button>

        {onBackToLogin ? (
          <button
            type="button"
            onClick={onBackToLogin}
            className="mt-2 text-center text-sm text-[#1C1C23] transition-opacity hover:opacity-75"
          >
            返回登录
          </button>
        ) : null}
      </form>
    </LoginShell>
  );
}
