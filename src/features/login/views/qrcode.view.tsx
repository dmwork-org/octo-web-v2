import { QRCodeSVG } from "qrcode.react";
import { useCallback } from "react";
import { useQrcodeLogin } from "@/features/login/hooks/use-qrcode-login.hook";
import { useFinalizeLogin } from "@/features/login/lib/post-login-flow";
import { Button } from "@/components/semi-bridge/button";
import type { LoginResp } from "@/features/base/api/endpoints/user.api";

interface QrcodeViewProps {
  redirect?: string;
  /** URL `?invite_code=` 透传 — 登录成功自动 join space。 */
  inviteCode?: string;
  onSwitchToPassword?: () => void;
}

/**
 * 二维码扫码登录(对齐老仓 dmworklogin login.tsx LoginType.qrcode 区块)。
 *
 * UI:
 *   - 二维码卡片(中心 SVG 200x200)
 *   - 扫描后头像覆盖(scanned 态)
 *   - 过期遮罩 + 刷新按钮
 *   - 底部 3 步流程图("打开 App → 扫一扫 → 确认登录")
 *   - 切回密码登录链接
 */
export function QrcodeView({ redirect, inviteCode, onSwitchToPassword }: QrcodeViewProps) {
  const finalize = useFinalizeLogin(inviteCode, redirect);

  const onSuccess = useCallback((resp: LoginResp) => void finalize(resp), [finalize]);

  const { state, refresh } = useQrcodeLogin({ onSuccess });

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-base">
      <div className="flex w-80 flex-col gap-4 rounded-lg border border-border-default bg-bg-surface p-6 shadow-sm">
        <h1 className="text-center text-xl font-semibold text-text-primary">扫码登录</h1>

        <div className="relative mx-auto flex h-52 w-52 items-center justify-center rounded-md border border-border-subtle bg-white">
          {state.loading || !state.qrcode ? (
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          ) : (
            <QRCodeSVG value={state.qrcode} size={192} level="M" />
          )}

          {/* 扫描后头像覆盖(scanned 态)*/}
          {state.status === "scanned" ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/95">
              {state.scannedAvatar ? (
                <img
                  src={state.scannedAvatar}
                  alt={state.scannedName ?? state.scannedUid ?? ""}
                  className="h-16 w-16 rounded-full bg-bg-elevated object-cover"
                />
              ) : null}
              <p className="text-sm font-medium text-text-primary">
                {state.scannedName ?? "已扫描"}
              </p>
              <p className="text-xs text-text-tertiary">请在 App 上确认登录</p>
            </div>
          ) : null}

          {/* 过期遮罩 */}
          {state.status === "expired" ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40 text-white">
              <p className="text-sm">二维码已过期</p>
              <Button onClick={refresh} type="primary" theme="solid">
                点击刷新
              </Button>
            </div>
          ) : null}
        </div>

        {state.error ? <p className="text-center text-xs text-error">{state.error}</p> : null}

        {/* 3 步流程图 */}
        <div className="flex items-center justify-around text-[11px] text-text-tertiary">
          <div className="flex flex-col items-center gap-1">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-bg-elevated text-text-secondary">
              1
            </span>
            <span>打开 App</span>
          </div>
          <span>→</span>
          <div className="flex flex-col items-center gap-1">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-bg-elevated text-text-secondary">
              2
            </span>
            <span>扫一扫</span>
          </div>
          <span>→</span>
          <div className="flex flex-col items-center gap-1">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-bg-elevated text-text-secondary">
              3
            </span>
            <span>确认登录</span>
          </div>
        </div>

        {onSwitchToPassword ? (
          <button
            type="button"
            onClick={onSwitchToPassword}
            className="text-center text-xs text-brand hover:underline"
          >
            使用账号密码登录
          </button>
        ) : null}
      </div>
    </div>
  );
}
