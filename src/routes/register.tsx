import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { RegisterView } from "@/features/login/views/register.view";

/**
 * 注册独立路由 `/register`(对齐 /login 的 search 透传)。
 *
 * "已有账号？登录" 链接 navigate 回 /login。
 */
const searchSchema = z.object({
  redirect: z.string().optional(),
  invite_code: z.string().optional(),
});

export const Route = createFileRoute("/register")({
  validateSearch: searchSchema,
  component: function RegisterRouteComponent() {
    const search = Route.useSearch();
    return <RegisterView redirect={search.redirect} inviteCode={search.invite_code} />;
  },
});
