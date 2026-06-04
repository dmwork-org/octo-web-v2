import { useEffect, useRef, useState } from "react";

interface SendCodeButtonProps {
  /** 父组件用 useCodeCountdown 持有的 count(s)。 */
  countdown: number;
  /** 触发发送 — 成功 resolve 后父组件调 start(60) 启动倒计时。 */
  onSend: () => Promise<void>;
  /** 额外 disable(如 emailValid=false)。 */
  disabled?: boolean;
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
 * **样式 1:1 老仓 Semi `type=primary theme=light`**(浅 brand bg + brand 文字):
 * - 默认:bg rgba(28,28,35,0.06) + text brand #1C1C23 + 1.5px border #e4e6ef
 * - hover(可点):bg 加深到 rgba(28,28,35,0.10)
 * - disabled(倒计时中 / loading / email 非法):bg #fafbfc + text #b0b4c8
 *
 * **交互 1:1 老仓**:
 * - `countdown` 外部传(useCodeCountdown),> 0 时显 `{n}s` + 禁用
 * - 内部 `loading` state:点击 → setLoading(true) → await onSend();成功后
 *   倒计时启动 → useClearLoadingWhenCountdownStarts 清 loading;失败 catch 立即清
 * - 高度 46 + min-width 96 + 圆角 10 + 13px + flex-shrink 0
 * - loading spinner inline SVG(老仓 animation wk-spin → Tailwind animate-spin)
 *
 * **绕过 semi-bridge/Button**:bridge 把 `type=primary theme=light` 解析成
 * shadcn `variant=secondary`(灰),跟老仓 Semi light brand 视觉不一致;
 * 改用原生 `<button>` 直出。
 */
export function SendCodeButton({ countdown, onSend, disabled }: SendCodeButtonProps) {
  const [loading, setLoading] = useState(false);
  useClearLoadingWhenCountdownStarts(countdown, setLoading);

  const isDisabled = countdown > 0 || loading || disabled;
  const label = countdown > 0 ? `${countdown}s` : "发送验证码";

  const onClick = async () => {
    if (isDisabled) return;
    setLoading(true);
    try {
      await onSend();
    } catch {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      disabled={isDisabled}
      onClick={onClick}
      className={[
        "inline-flex h-[46px] min-w-[96px] shrink-0 items-center justify-center gap-1.5 rounded-[10px] border-[1.5px] text-[13px] font-medium whitespace-nowrap transition-all",
        isDisabled
          ? "cursor-not-allowed border-[#e4e6ef] bg-[#fafbfc] text-[#b0b4c8]"
          : "cursor-pointer border-[#e4e6ef] bg-[rgba(28,28,35,0.06)] text-[#1C1C23] hover:bg-[rgba(28,28,35,0.10)]",
      ].join(" ")}
    >
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
    </button>
  );
}
