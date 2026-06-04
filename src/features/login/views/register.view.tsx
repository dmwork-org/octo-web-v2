import { useCallback, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useRegisterByEmailMutation, useSendEmailCodeMutation } from "@/features/login/mutations";
import { authActions, type AuthUser } from "@/features/base/stores/auth";
import { isValidEmail } from "@/features/login/lib/email-validator";
import { extractSafeErrorMessage } from "@/features/login/lib/sanitize-error";
import { CodeCountdownButton } from "@/features/login/components/code-countdown-button";
import { PasswordStrengthIndicator } from "@/features/login/components/password-strength-indicator";
import { Button } from "@/components/semi-bridge/button";
import type { LoginResp } from "@/features/base/api/endpoints/user.api";

interface RegisterViewProps {
  redirect?: string;
  onBackToLogin?: () => void;
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
 * 邮箱注册视图(对齐老仓 dmworklogin login.tsx LoginType.register 区块):
 *
 * - 邮箱(`isValidEmail` 实时校验)
 * - 60s 倒计时发送验证码(`code_type=0`)
 * - 邮箱验证码
 * - 昵称(name)
 * - 密码 + 确认密码(+ 强度指示器)
 * - 注册成功 → signIn(LoginResp) → 跳 redirect
 */
export function RegisterView({ redirect, onBackToLogin }: RegisterViewProps) {
  const navigate = useNavigate();
  const sendCodeMu = useSendEmailCodeMutation();
  const registerMu = useRegisterByEmailMutation();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [inlineError, setInlineError] = useState<string | null>(null);

  const emailValid = isValidEmail(email);

  const sendCode = useCallback(async () => {
    if (!emailValid) {
      setInlineError("请输入有效邮箱");
      throw new Error("invalid email"); // 阻止倒计时启动
    }
    setInlineError(null);
    try {
      await sendCodeMu.mutateAsync({ email, codeType: 0 });
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
    if (!name) return setInlineError("请输入昵称");
    if (password.length < 6) return setInlineError("密码至少 6 位");
    if (password !== confirm) return setInlineError("两次密码不一致");
    try {
      const resp = await registerMu.mutateAsync({ email, code, name, password });
      authActions.signIn(resp.token, loginRespToAuthUser(resp));
      void navigate({ href: redirect ?? "/", replace: true });
    } catch (err) {
      setInlineError(extractSafeErrorMessage(err));
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-base">
      <form
        onSubmit={onSubmit}
        aria-label="register form"
        className="flex w-80 flex-col gap-3 rounded-lg border border-border-default bg-bg-surface p-6 shadow-sm"
      >
        <h1 className="text-xl font-semibold text-text-primary">注册</h1>

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
          昵称
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            className="mt-1 w-full rounded border border-border-default bg-bg-surface px-2 py-1.5 text-text-primary"
            required
          />
        </label>

        <label className="block text-sm text-text-secondary">
          密码
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded border border-border-default bg-bg-surface px-2 py-1.5 text-text-primary"
            autoComplete="new-password"
            required
          />
        </label>
        <PasswordStrengthIndicator password={password} />

        <label className="block text-sm text-text-secondary">
          确认密码
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
          loading={registerMu.isPending}
          className="w-full"
        >
          {registerMu.isPending ? "注册中…" : "注册"}
        </Button>

        {onBackToLogin ? (
          <button
            type="button"
            onClick={onBackToLogin}
            className="text-center text-xs text-brand hover:underline"
          >
            已有账号？登录
          </button>
        ) : null}
      </form>
    </div>
  );
}
