import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { QrcodeView } from "@/features/login/views/qrcode.view";

/**
 * 扫码登录独立路由 `/qrcode`(对齐 /login 的 search 透传:redirect + invite_code)。
 *
 * 用户从 /login 点"扫码登录"跳到这里;view 内 "使用账号密码登录" 链接 navigate
 * 回 /login(同样 search 透传)。
 */
const searchSchema = z.object({
  redirect: z.string().optional(),
  invite_code: z.string().optional(),
});

export const Route = createFileRoute("/qrcode")({
  validateSearch: searchSchema,
  component: function QrcodeRouteComponent() {
    const search = Route.useSearch();
    return <QrcodeView redirect={search.redirect} inviteCode={search.invite_code} />;
  },
});
