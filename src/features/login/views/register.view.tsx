import { useCallback, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useRegisterByEmailMutation, useSendEmailCodeMutation } from "@/features/login/mutations";
import { isValidEmail } from "@/features/login/lib/email-validator";
import { extractSafeErrorMessage } from "@/features/login/lib/sanitize-error";
import { useFinalizeLogin } from "@/features/login/lib/post-login-flow";
import { CodeCountdownButton } from "@/features/login/components/code-countdown-button";
import { PasswordStrengthIndicator } from "@/features/login/components/password-strength-indicator";
import { LoginShell } from "@/features/login/components/login-shell";
import { DownloadButtons } from "@/features/login/components/download-buttons";
import { Button } from "@/components/semi-bridge/button";

interface RegisterViewProps {
  redirect?: string;
  /** URL `?invite_code=` 透传 — 注册成功自动 join space。 */
  inviteCode?: string;
}

const INPUT_CLS =
  "h-[46px] w-full rounded-[10px] border-[1.5px] border-[#e4e6ef] bg-[#fafbfc] px-4 text-[15px] text-[#1a1a2e] transition-all outline-none placeholder:text-[#b0b4c8] focus:border-[#1C1C23] focus:bg-white focus:shadow-[0_0_0_3px_rgba(28,28,35,0.12)]";

/**
 * 邮箱注册视图 — 独立路由 /register(对齐老仓 dmworklogin LoginType.register):
 * - 邮箱(isValidEmail 实时校验)+ 60s 倒计时验证码(code_type=0)
 * - 昵称(20 限,maxLength 硬约束)+ 密码(强度指示)+ 确认密码
 * - 注册成功 → finalize(LoginResp);底部 Android/iOS 下载按钮
 * - "已有账号？登录" navigate 回 /login(search 透传)
 */
export function RegisterView({ redirect, inviteCode }: RegisterViewProps) {
  const navigate = useNavigate();
  const sendCodeMu = useSendEmailCodeMutation();
  const registerMu = useRegisterByEmailMutation();
  const finalize = useFinalizeLogin(inviteCode, redirect);
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
      throw new Error("invalid email");
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
      void finalize(resp);
    } catch (err) {
      setInlineError(extractSafeErrorMessage(err));
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
        创建账号
      </div>
      <div className="mb-7 text-left text-sm text-[#8a8fa8]">加入 Octo，开始高效协作</div>

      <form onSubmit={onSubmit} aria-label="register form" className="flex flex-col gap-3.5">
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
            placeholder="邮箱验证码"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            required
            className={`${INPUT_CLS} flex-1 tracking-widest`}
          />
          <CodeCountdownButton onSend={sendCode} disabled={!emailValid} />
        </div>
        <input
          type="text"
          placeholder="昵称"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={20}
          required
          className={INPUT_CLS}
        />
        <input
          type="password"
          placeholder="密码"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          required
          className={INPUT_CLS}
        />
        <PasswordStrengthIndicator password={password} />
        <input
          type="password"
          placeholder="确认密码"
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
          loading={registerMu.isPending}
          className="mt-2 h-[46px] w-full cursor-pointer rounded-[10px] !bg-brand text-[15px] font-semibold tracking-[0.3px] text-white hover:!bg-brand-hover"
        >
          {registerMu.isPending ? "注册中…" : "注册"}
        </Button>

        <button
          type="button"
          onClick={backToLogin}
          className="mt-2 cursor-pointer text-center text-sm font-medium text-[#1C1C23] transition-opacity hover:opacity-75"
        >
          已有账号？登录
        </button>
      </form>

      <DownloadButtons />
    </LoginShell>
  );
}
