import { QRCodeSVG } from "qrcode.react";
import { useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQrcodeLogin } from "@/features/login/hooks/use-qrcode-login.hook";
import { useFinalizeLogin } from "@/features/login/lib/post-login-flow";
import { LoginShell } from "@/features/login/components/login-shell";
import type { LoginResp } from "@/features/base/api/endpoints/user.api";

interface QrcodeViewProps {
  redirect?: string;
  inviteCode?: string;
}

/**
 * 二维码扫码登录 — 严格 1:1 对齐老仓 dmworklogin login.tsx LoginType.qrcode 区块
 * (行 665-732):
 *
 * - 标题 22px + 副标题 13px "更安全、更快速的登录方式"
 * - QR card 280×card,内 180×180 wrap(1.5px #e4e8f5 border + 圆角 14)
 * - QRCodeSVG size 176(老仓 line 674)
 * - 头像 overlay:scanned 时 48×48 居中覆盖二维码(2px white border + 阴影)
 * - 过期遮罩:白色 95% bg + "二维码已失效，点击刷新" + 36×36 refresh 图标
 * - 3 步 SVG icons(phone / qr-scan / check-circle)+ title/desc + 右箭头 divider
 * - 单按钮 "使用账号密码登录" 回 /login(老仓 .wk-login-footer-buttons,单按钮)
 * - **无下载按钮**(老仓 .wk-login-content-download 不在 qrcode 区块)
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
      <div className="mb-1 text-center text-[22px] leading-[1.25] font-bold text-[#1a1a2e]">
        扫码登录
      </div>
      <div className="mb-6 text-center text-[13px] text-[#8a8fa8]">更安全、更快速的登录方式</div>

      {/* QR card */}
      <div className="mx-auto mb-6 flex w-[280px] flex-col items-center rounded-[20px] border-[1.5px] border-[#eef0f8] bg-[#f8f9ff] px-8 pt-7 pb-5">
        <div className="relative flex h-[180px] w-[180px] items-center justify-center rounded-[14px] border-[1.5px] border-[#e4e8f5] bg-white">
          {state.loading || !state.qrcode ? (
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#5b5be5] border-t-transparent" />
          ) : (
            <QRCodeSVG value={state.qrcode} size={176} level="M" />
          )}

          {/* 头像 overlay — 48×48 居中,scanned 态显示 */}
          {state.status === "scanned" && state.scannedAvatar ? (
            <img
              src={state.scannedAvatar}
              alt={state.scannedName ?? state.scannedUid ?? ""}
              className="absolute top-1/2 left-1/2 -mt-6 -ml-6 h-12 w-12 rounded-full border-2 border-white object-cover shadow-[0_2px_8px_rgba(0,0,0,0.15)]"
            />
          ) : null}

          {/* 过期遮罩 — 白色 95% + 文字 + refresh icon */}
          {state.status === "expired" ? (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2.5 rounded-[14px] bg-white/95">
              <p className="text-[13px] text-[#5a607a]">二维码已失效，点击刷新</p>
              <button
                type="button"
                onClick={refresh}
                aria-label="刷新二维码"
                className="cursor-pointer opacity-60 transition-opacity hover:opacity-100"
              >
                <svg
                  width={36}
                  height={36}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#5a607a"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="23 4 23 10 17 10" />
                  <polyline points="1 20 1 14 7 14" />
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                </svg>
              </button>
            </div>
          ) : null}
        </div>
        <div className="mt-3.5 text-center text-[13px] text-[#8a8fa8]">打开 Octo 扫描二维码</div>
      </div>

      {state.error ? <p className="mb-3 text-center text-xs text-error">{state.error}</p> : null}

      {/* 3 步流程图 — 横向 step + 右箭头 divider */}
      <div className="mx-auto mb-6 flex w-[300px] items-start gap-1 px-2">
        <QrStep
          title="打开 App"
          desc="手机打开 Octo"
          icon={
            <svg
              width={22}
              height={22}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="5" y="2" width="14" height="20" rx="2" />
              <circle cx="12" cy="17" r="1" fill="currentColor" />
            </svg>
          }
        />
        <QrDivider />
        <QrStep
          title="扫描二维码"
          desc="聊天 → + → 扫一扫"
          icon={
            <svg
              width={22}
              height={22}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 7V5a2 2 0 0 1 2-2h2" />
              <path d="M17 3h2a2 2 0 0 1 2 2v2" />
              <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
              <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
              <circle cx="12" cy="12" r="2.5" />
            </svg>
          }
        />
        <QrDivider />
        <QrStep
          title="确认登录"
          desc="手机端点击确认"
          icon={
            <svg
              width={22}
              height={22}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          }
        />
      </div>

      {/* 切回密码登录(.wk-login-footer-buttons 单按钮,1.5px brand 边,圆角 8,40h) */}
      <div className="flex justify-center">
        <button
          type="button"
          onClick={backToLogin}
          className="h-[40px] cursor-pointer rounded-[8px] border-[1.5px] border-[#1C1C23] bg-transparent px-6 text-[14px] font-medium text-[#1C1C23] transition-opacity hover:opacity-80"
        >
          使用账号密码登录
        </button>
      </div>
    </LoginShell>
  );
}

function QrStep({ title, desc, icon }: { title: string; desc: string; icon: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center gap-1.5">
      <div className="flex h-[44px] w-[44px] items-center justify-center rounded-[12px] border-[1.5px] border-[#e8eaf6] bg-white text-[#1a1a2e] shadow-[0_2px_6px_rgba(99,102,241,0.08)]">
        {icon}
      </div>
      <div className="text-center text-[12px] font-semibold whitespace-nowrap text-[#1a1a2e]">
        {title}
      </div>
      <div className="text-center text-[11px] whitespace-nowrap text-[#8a8fa8]">{desc}</div>
    </div>
  );
}

function QrDivider() {
  return (
    <div className="flex w-4 shrink-0 items-center pb-9">
      <svg
        width={16}
        height={16}
        viewBox="0 0 24 24"
        fill="none"
        stroke="#c8cce0"
        strokeWidth={2}
        strokeLinecap="round"
      >
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </div>
  );
}
