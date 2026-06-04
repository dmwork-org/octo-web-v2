import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/semi-bridge/button";

interface SendCodeButtonProps {
  /** 父组件用 useCodeCountdown 持有的 count(s)。 */
  countdown: number;
  /** 触发发送 — 成功 resolve 后父组件调 start(60) 启动倒计时。 */
  onSend: () => Promise<void>;
  /** 额外 disable(如 emailValid=false)。 */
  disabled?: boolean;
  className?: string;
}

/** countdown 从 0 → 正数(发送成功)时清掉内部 loading(对齐老仓 prevCountdown 逻辑)。
 *  抽出命名 hook 满足 no-useeffect-in-component。 */
function useClearLoadingWhenCountdownStarts(countdown: number, setLoading: (v: boolean) => void) {
  const prev = useRef(countdown);
  useEffect(() => {
    if (prev.current === 0 && countdown > 0) setLoading(false);
    prev.current = countdown;
  }, [countdown, setLoading]);
}

/**
 * 验证码按钮(对齐老仓 dmworklogin login.tsx:230-271 SendCodeButton):
 *
 * - `countdown` 外部传(父用 useCodeCountdown),> 0 时显 `{n}s` + 禁用
 * - 内部 `loading` state:点击 → setLoading(true) → await onSend() → 倒计时启动后
 *   useClearLoadingWhenCountdownStarts 清 loading;失败 catch 立即清
 * - 高度 46 + min-width 96 + 圆角 10 + 13px(老仓 .wk-login-content-form-code-btn)
 * - loading spinner inline SVG(老仓 animation wk-spin)
 */
export function SendCodeButton({ countdown, onSend, disabled, className }: SendCodeButtonProps) {
  const [loading, setLoading] = useState(false);
  useClearLoadingWhenCountdownStarts(countdown, setLoading);

  const isDisabled = countdown > 0 || loading || disabled;
  const label = countdown > 0 ? `${countdown}s` : "发送验证码";

  return (
    <Button
      type="primary"
      theme="light"
      disabled={isDisabled}
      onClick={async () => {
        setLoading(true);
        try {
          await onSend();
        } catch {
          setLoading(false);
        }
      }}
      className={[
        "h-[46px] min-w-[96px] shrink-0 cursor-pointer rounded-[10px] text-[13px] whitespace-nowrap",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className="inline-flex items-center justify-center gap-1.5">
        {loading ? (
          <svg
            width={14}
            height={14}
            viewBox="0 0 14 14"
            className="shrink-0 animate-spin"
            aria-hidden
          >
            <circle
              cx="7"
              cy="7"
              r="5.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeDasharray="26"
              strokeDashoffset="10"
              strokeLinecap="round"
            />
          </svg>
        ) : null}
        {label}
      </span>
    </Button>
  );
}
