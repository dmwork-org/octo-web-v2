import { useState, useEffect } from "react";
import { Button } from "@/components/semi-bridge/button";

interface CodeCountdownButtonProps {
  /** 触发发送 — 返回 Promise,resolve 后开始倒计时;reject 不开始。 */
  onSend: () => Promise<void>;
  /** 倒计时秒数,默认 60s(对齐老仓 dmworklogin 邮件验证码窗口)。 */
  seconds?: number;
  /** disable 条件(如邮箱格式不合法时禁用)。 */
  disabled?: boolean;
  /** 按钮文案(默认"发送验证码")。 */
  label?: string;
}

/** 倒计时 effect 命名 hook(满足 no-useeffect-in-component)。 */
function useCountdownTick(remaining: number, setRemaining: (n: number) => void) {
  useEffect(() => {
    if (remaining <= 0) return;
    const t = setTimeout(() => setRemaining(remaining - 1), 1000);
    return () => clearTimeout(t);
  }, [remaining, setRemaining]);
}

/**
 * 60s 倒计时按钮(注册 + 找回密码 公用)。
 *
 * - 点击 → onSend 成功 → 进入倒计时(显 "60s 后重试")
 * - 倒计时归零 → 恢复可点
 * - 发送中 loading;失败回到可点
 */
export function CodeCountdownButton({
  onSend,
  seconds = 60,
  disabled,
  label = "发送验证码",
}: CodeCountdownButtonProps) {
  const [remaining, setRemaining] = useState(0);
  const [sending, setSending] = useState(false);
  useCountdownTick(remaining, setRemaining);

  const ticking = remaining > 0;
  const onClick = async () => {
    if (sending || ticking || disabled) return;
    setSending(true);
    try {
      await onSend();
      setRemaining(seconds);
    } finally {
      setSending(false);
    }
  };

  return (
    <Button
      onClick={onClick}
      disabled={disabled || sending || ticking}
      loading={sending}
      className="shrink-0"
    >
      {ticking ? `${remaining}s 后重试` : label}
    </Button>
  );
}
