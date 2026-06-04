/**
 * 登录页 view 切换枚举(对齐老仓 dmworklogin/src/login_vm.tsx LoginType)。
 *
 * 老仓只有 4 种(注意:**没有** sms / 邮箱验证码登录,验证码仅用于"注册"和"找回密码"):
 * - `phone`:默认 — 账号密码 / 邮箱密码登录(命名沿用老仓,实际表单含两种 identifier)
 * - `qrcode`:扫码登录
 * - `register`:邮箱注册(主流)/ usernameregister(兜底)
 * - `forgetPassword`:邮箱验证码找回
 *
 * SSO/OIDC 不在此枚举内 — 它是 `phone` 页面下"如果 appconfig 暴露 provider 就显主 CTA"的开关。
 */
export type LoginType = "phone" | "qrcode" | "register" | "forgetPassword";

export const LoginType = {
  Phone: "phone",
  Qrcode: "qrcode",
  Register: "register",
  ForgetPassword: "forgetPassword",
} as const;
