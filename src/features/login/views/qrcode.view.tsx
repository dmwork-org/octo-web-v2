import { QRCodeSVG } from "qrcode.react";
import { useCallback } from "react";
import { useQrcodeLogin } from "@/features/login/hooks/use-qrcode-login.hook";
import { useFinalizeLogin } from "@/features/login/lib/post-login-flow";
import { LoginShell } from "@/features/login/components/login-shell";
import { Button } from "@/components/semi-bridge/button";
import type { LoginResp } from "@/features/base/api/endpoints/user.api";

interface QrcodeViewProps {
  redirect?: string;
  /** URL `?invite_code=` 透传 — 登录成功自动 join space。 */
  inviteCode?: string;
  onSwitchToPassword?: () => void;
}

/**
 * 二维码扫码登录(对齐老仓 dmworklogin login.tsx LoginType.qrcode 区块):
 * - 二维码卡片(280×280,圆角 20)+ scanned 头像覆盖 + expired 遮罩
 * - 3 步流程图(打开 App → 扫一扫 → 确认登录)
 * - 切回密码登录链接
 */
export function QrcodeView({ redirect, inviteCode, onSwitchToPassword }: QrcodeViewProps) {
  const finalize = useFinalizeLogin(inviteCode, redirect);
  const onSuccess = useCallback((resp: LoginResp) => void finalize(resp), [finalize]);
  const { state, refresh } = useQrcodeLogin({ onSuccess });

  return (
    <LoginShell>
      <div className="mb-2.5 text-left text-[30px] leading-[1.25] font-bold tracking-tight text-[#1a1a2e]">
        扫码登录
      </div>
      <div className="mb-7 text-left text-sm text-[#8a8fa8]">用 Octo App 扫一扫,立即登录</div>

      {/* 二维码卡片 — 对齐老仓 .wk-login-qr-card */}
      <div className="mx-auto mb-6 flex w-[280px] flex-col items-center rounded-[20px] border-[1.5px] border-[#eef0f8] bg-[#f8f9ff] px-8 pt-7 pb-5">
        <div className="relative flex h-52 w-52 items-center justify-center">
          {state.loading || !state.qrcode ? (
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#7A5CFF] border-t-transparent" />
          ) : (
            <QRCodeSVG value={state.qrcode} size={192} level="M" />
          )}

          {state.status === "scanned" ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded bg-white/95">
              {state.scannedAvatar ? (
                <img
                  src={state.scannedAvatar}
                  alt={state.scannedName ?? state.scannedUid ?? ""}
                  className="h-16 w-16 rounded-full bg-bg-elevated object-cover"
                />
              ) : null}
              <p className="text-sm font-medium text-[#1a1a2e]">{state.scannedName ?? "已扫描"}</p>
              <p className="text-xs text-[#8a8fa8]">请在 App 上确认登录</p>
            </div>
          ) : null}

          {state.status === "expired" ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded bg-black/40 text-white">
              <p className="text-sm">二维码已过期</p>
              <Button onClick={refresh} type="primary" theme="solid">
                点击刷新
              </Button>
            </div>
          ) : null}
        </div>
        <p className="mt-3.5 text-center text-[13px] text-[#8a8fa8]">打开 Octo App 扫描二维码</p>
      </div>

      {state.error ? <p className="mb-3 text-center text-xs text-error">{state.error}</p> : null}

      {/* 3 步流程图(横向 step) */}
      <div className="mx-auto mb-6 flex w-[300px] items-stretch justify-around text-[11px] text-[#8a8fa8]">
        <Step n={1} label="打开 App" />
        <Arrow />
        <Step n={2} label="扫一扫" />
        <Arrow />
        <Step n={3} label="确认登录" />
      </div>

      {onSwitchToPassword ? (
        <button
          type="button"
          onClick={onSwitchToPassword}
          className="text-center text-sm text-[#1C1C23] transition-opacity hover:opacity-75"
        >
          使用账号密码登录
        </button>
      ) : null}
    </LoginShell>
  );
}

function Step({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#f0f1f7] text-[11px] font-semibold text-[#1a1a2e]">
        {n}
      </span>
      <span>{label}</span>
    </div>
  );
}

function Arrow() {
  return <span className="self-center text-[#b0b4c8]">→</span>;
}
