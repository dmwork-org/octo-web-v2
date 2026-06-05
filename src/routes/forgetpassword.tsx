import { createFileRoute } from "@tanstack/react-router";
import { ForgetPasswordView } from "@/features/login/views/forget-password.view";

/**
 * 找回密码独立路由 `/forgetpassword`(structure-lint 拒 dash 中段名,故单词拼接)。
 *
 * 不需要 search 透传(忘记密码独立流程,与 redirect/inviteCode 无关)。
 * "返回登录" 链接 navigate 回 /login。
 */
export const Route = createFileRoute("/forgetpassword")({
  component: () => <ForgetPasswordView />,
});
