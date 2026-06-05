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
      toast.error("请先输入正确的邮箱地址！");
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
    if (!isValidEmail(email)) return toast.error("请输入正确的邮箱地址！");
    if (!code) return toast.error("邮箱验证码不能为空！");
    if (!name) return toast.error("昵称不能为空！");
    const pwdErr = validatePassword(password);
    if (pwdErr) return toast.error(pwdErr);
    if (password !== confirm) return toast.error("两次密码输入不一致！");
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
        创建账号
      </div>
      <div className="mb-7 text-left text-sm text-[#8a8fa8]">加入 Octo，开始高效协作</div>

      <form onSubmit={onSubmit} aria-label="register form" className="flex flex-col">
        <LoginInput
          type="email"
          name="reg-email"
          autoComplete="email"
          placeholder="邮箱"
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
            placeholder="邮箱验证码"
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
          placeholder="昵称"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={20}
        />

        <LoginInput
          type="password"
          name="reg-password"
          autoComplete="off"
          placeholder="密码"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <PasswordStrengthMeter password={password} />

        <LoginInput
          type="password"
          name="reg-confirm-password"
          autoComplete="off"
          placeholder="确认密码"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />

        <div className="mt-5">
          <LoginPrimaryButton htmlType="submit" loading={registerMu.isPending}>
            {registerMu.isPending ? "注册中…" : "注册"}
          </LoginPrimaryButton>
        </div>

        {/* 底部链接(.wk-login-content-form-others 单链接) */}
        <div className="mt-5 flex justify-center">
          <button
            type="button"
            onClick={backToLogin}
            className="cursor-pointer text-[14px] font-medium text-[#1C1C23] transition-opacity hover:opacity-75"
          >
            已有账号？登录
          </button>
        </div>
      </form>
    </LoginShell>
  );
}
