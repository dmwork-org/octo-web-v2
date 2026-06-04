import { useCallback, useState } from "react";
import { useResetPasswordMutation, useSendEmailCodeMutation } from "@/features/login/mutations";
import { isValidEmail } from "@/features/login/lib/email-validator";
import { extractSafeErrorMessage } from "@/features/login/lib/sanitize-error";
import { CodeCountdownButton } from "@/features/login/components/code-countdown-button";
import { PasswordStrengthIndicator } from "@/features/login/components/password-strength-indicator";
import { Button } from "@/components/semi-bridge/button";

interface ForgetPasswordViewProps {
  onBackToLogin?: () => void;
}

/**
 * 找回密码视图(对齐老仓 dmworklogin login.tsx LoginType.forgetPassword 区块):
 *
 * - 邮箱(`isValidEmail` 实时校验)
 * - 60s 倒计时发送验证码(`code_type=2`,**注意跟注册的 code_type=0 不同**)
 * - 邮箱验证码
 * - 新密码 + 确认密码(+ 强度指示)
 * - 成功 → 显成功 + 切回登录
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
      <div className="flex min-h-screen items-center justify-center bg-bg-base">
        <div className="flex w-80 flex-col items-center gap-3 rounded-lg border border-border-default bg-bg-surface p-8 shadow-sm">
          <p className="text-sm text-success">密码已重置,请使用新密码登录</p>
          {onBackToLogin ? (
            <Button type="primary" theme="solid" onClick={onBackToLogin} className="w-full">
              返回登录
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-base">
      <form
        onSubmit={onSubmit}
        aria-label="forget password form"
        className="flex w-80 flex-col gap-3 rounded-lg border border-border-default bg-bg-surface p-6 shadow-sm"
      >
        <h1 className="text-xl font-semibold text-text-primary">找回密码</h1>

        <label className="block text-sm text-text-secondary">
          邮箱
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded border border-border-default bg-bg-surface px-2 py-1.5 text-text-primary"
            autoComplete="email"
            required
          />
        </label>

        <label className="block text-sm text-text-secondary">
          验证码
          <div className="mt-1 flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="flex-1 rounded border border-border-default bg-bg-surface px-2 py-1.5 tracking-widest text-text-primary"
              required
            />
            <CodeCountdownButton onSend={sendCode} disabled={!emailValid} />
          </div>
        </label>

        <label className="block text-sm text-text-secondary">
          新密码
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="mt-1 w-full rounded border border-border-default bg-bg-surface px-2 py-1.5 text-text-primary"
            autoComplete="new-password"
            required
          />
        </label>
        <PasswordStrengthIndicator password={newPassword} />

        <label className="block text-sm text-text-secondary">
          确认新密码
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="mt-1 w-full rounded border border-border-default bg-bg-surface px-2 py-1.5 text-text-primary"
            autoComplete="new-password"
            required
          />
        </label>

        {inlineError ? <p className="text-xs text-error">{inlineError}</p> : null}

        <Button
          htmlType="submit"
          type="primary"
          theme="solid"
          loading={resetMu.isPending}
          className="w-full"
        >
          {resetMu.isPending ? "重置中…" : "重置密码"}
        </Button>

        {onBackToLogin ? (
          <button
            type="button"
            onClick={onBackToLogin}
            className="text-center text-xs text-brand hover:underline"
          >
            返回登录
          </button>
        ) : null}
      </form>
    </div>
  );
}
