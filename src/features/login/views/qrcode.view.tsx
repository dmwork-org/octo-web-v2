import { QRCodeSVG } from "qrcode.react";
import { useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQrcodeLogin } from "@/features/login/hooks/use-qrcode-login.hook";
import { useFinalizeLogin } from "@/features/login/lib/post-login-flow";
import { LoginShell } from "@/features/login/components/login-shell";
import { DownloadButtons } from "@/features/login/components/download-buttons";
import { Button } from "@/components/semi-bridge/button";
import type { LoginResp } from "@/features/base/api/endpoints/user.api";

interface QrcodeViewProps {
  redirect?: string;
  inviteCode?: string;
}

/**
 * 二维码扫码登录(1:1 对齐老仓 dmworklogin login.tsx LoginType.qrcode 区块):
 * - slogan 22px + sub `更安全、更快速的登录方式`
 * - QR 卡片 280×card,内 180×180 容器,QRCodeSVG size 176
 * - 3 步流程图:icon 44×44 圆角 12 + 1.5px border;title 12px weight 600 + desc 11px
 * - "使用账号密码登录" navigate 回 /login(search 透传)
 */
export function QrcodeView({ redirect, inviteCode }: QrcodeViewProps) {
  const navigate = useNavigate();
  const finalize = useFinalizeLogin(inviteCode, redirect);
  const onSuccess = useCallback((resp: LoginResp) => void finalize(resp), [finalize]);
  const { state, refresh } = useQrcodeLogin({ onSuccess });

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
      <div className="mb-1 text-left text-[22px] leading-[1.25] font-bold text-[#1a1a2e]">
        扫码登录
      </div>
      <div className="mb-7 text-left text-[13px] text-[#8a8fa8]">更安全、更快速的登录方式</div>

      <div className="mx-auto mb-6 flex w-[280px] flex-col items-center rounded-[20px] border-[1.5px] border-[#eef0f8] bg-[#f8f9ff] px-8 pt-7 pb-5">
        <div className="relative flex h-[180px] w-[180px] items-center justify-center rounded-[14px] border-[1.5px] border-[#e4e8f5] bg-white">
          {state.loading || !state.qrcode ? (
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#5b5be5] border-t-transparent" />
          ) : (
            <QRCodeSVG value={state.qrcode} size={176} level="M" />
          )}

          {state.status === "scanned" ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-[14px] bg-white/95">
              {state.scannedAvatar ? (
                <img
                  src={state.scannedAvatar}
                  alt={state.scannedName ?? state.scannedUid ?? ""}
                  className="h-14 w-14 rounded-full bg-bg-elevated object-cover"
                />
              ) : null}
              <p className="text-sm font-medium text-[#1a1a2e]">{state.scannedName ?? "已扫描"}</p>
              <p className="text-xs text-[#8a8fa8]">请在 App 上确认登录</p>
            </div>
          ) : null}

          {state.status === "expired" ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-[14px] bg-black/40 text-white">
              <p className="text-sm">二维码已过期</p>
              <Button onClick={refresh} type="primary" theme="solid" className="cursor-pointer">
                点击刷新
              </Button>
            </div>
          ) : null}
        </div>
        <p className="mt-3.5 text-center text-[13px] text-[#8a8fa8]">打开 Octo 扫描二维码</p>
      </div>

      {state.error ? <p className="mb-3 text-center text-xs text-error">{state.error}</p> : null}

      <div className="mx-auto mb-6 flex w-full items-start justify-around gap-2">
        <QrStep n={1} title="打开 App" desc="手机打开 Octo" />
        <QrArrow />
        <QrStep n={2} title="扫描二维码" desc="聊天 → + → 扫一扫" />
        <QrArrow />
        <QrStep n={3} title="确认登录" desc="手机端点击确认" />
      </div>

      <button
        type="button"
        onClick={backToLogin}
        className="cursor-pointer text-center text-sm font-medium text-[#1C1C23] transition-opacity hover:opacity-75"
      >
        使用账号密码登录
      </button>

      <DownloadButtons />
    </LoginShell>
  );
}

function QrStep({ n, title, desc }: { n: number; title: string; desc: string }) {
  return (
    <div className="flex flex-1 flex-col items-center gap-1.5">
      <div className="flex h-[44px] w-[44px] items-center justify-center rounded-[12px] border-[1.5px] border-[#e8eaf6] bg-white text-[14px] font-semibold text-[#1a1a2e]">
        {n}
      </div>
      <div className="text-center text-[12px] font-semibold text-[#1a1a2e]">{title}</div>
      <div className="text-center text-[11px] text-[#8a8fa8]">{desc}</div>
    </div>
  );
}

function QrArrow() {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#c8cce0"
      strokeWidth={2}
      className="mt-3.5 shrink-0 self-start"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
