import { forwardRef, type InputHTMLAttributes } from "react";

/**
 * 登录表单公共 input — 对齐老仓 `.wk-login-content-form input`(login.css 行 282-307):
 * - height 46 / border-radius 10 / 1.5px border #e4e6ef / bg #fafbfc
 * - font-size 15 / padding 0 16 / margin-bottom 14
 * - placeholder color #b0b4c8
 * - focus:border #1C1C23 + box-shadow 0 0 0 3px rgba(28,28,35,0.12) + bg white
 *
 * 提供 `noMargin` 用于 code-row 等场景去掉默认 mb(老仓
 * `.wk-login-content-form-code-row input { margin-bottom: 0 !important }`)。
 */
interface LoginInputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** 去掉默认 mb-3.5(用于 code-row 同行布局)。 */
  noMargin?: boolean;
}

export const LoginInput = forwardRef<HTMLInputElement, LoginInputProps>(function LoginInput(
  { noMargin, className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      {...rest}
      className={[
        "h-[46px] w-full rounded-[10px] border-[1.5px] border-[#e4e6ef] bg-[#fafbfc] px-4 text-[15px] text-[#1a1a2e] transition-all outline-none",
        "placeholder:text-[#b0b4c8]",
        "focus:border-[#1C1C23] focus:bg-white focus:shadow-[0_0_0_3px_rgba(28,28,35,0.12)]",
        noMargin ? "" : "mb-3.5",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    />
  );
});
