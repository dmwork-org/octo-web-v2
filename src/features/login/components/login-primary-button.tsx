import type { ReactNode } from "react";
import { Button } from "@/components/semi-bridge/button";

interface LoginPrimaryButtonProps {
  onClick?: () => void;
  htmlType?: "button" | "submit" | "reset";
  loading?: boolean;
  disabled?: boolean;
  children: ReactNode;
}

/**
 * 登录页主按钮(对齐老仓 `.wk-login-content-form-ok`,login.css 行 321-328):
 * - width 100% / height 46 / border-radius 10
 * - font-size 15 / font-weight 600 / letter-spacing 0.3
 * - bg = brand 黑 #1C1C23 / text white / hover bg brand-hover
 * - cursor pointer
 *
 * 登录 / 注册 / 重置密码 / "返回登录"(完成态)都走这个。
 * SSO 主 CTA 颜色不同(紫色 #5b5be5),用 inline className 覆盖即可。
 */
export function LoginPrimaryButton({
  onClick,
  htmlType = "button",
  loading,
  disabled,
  children,
}: LoginPrimaryButtonProps) {
  return (
    <Button
      htmlType={htmlType}
      type="primary"
      theme="solid"
      loading={loading}
      disabled={disabled}
      onClick={onClick}
      className="h-[46px] w-full cursor-pointer rounded-[10px] !bg-brand text-[15px] font-semibold tracking-[0.3px] text-white hover:!bg-brand-hover"
    >
      {children}
    </Button>
  );
}
