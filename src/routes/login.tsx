import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { LoginView } from "@/features/login/views/login.view";

/**
 * 登录路由 search params(对齐老仓 LoginVM.didMount 入参):
 * - `redirect`:登录成功后跳目标(默认 `/`)
 * - `invite_code`:邀请码 — 拉 invite info 显 banner;登录成功后自动加入对应 space
 *   (本地 + SSO 都共享:SSO 跳 IdP 前会写 `pendingInviteCode` 到 localStorage 中转,
 *   回来登录成功时同 inviteCode 路径自动 join)
 */
const loginSearchSchema = z.object({
  redirect: z.string().optional(),
  invite_code: z.string().optional(),
});

export const Route = createFileRoute("/login")({
  validateSearch: loginSearchSchema,
  component: function LoginRouteComponent() {
    const search = Route.useSearch();
    return <LoginView redirect={search.redirect} inviteCode={search.invite_code} />;
  },
});
