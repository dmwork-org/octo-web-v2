import { createFileRoute } from "@tanstack/react-router";
import { BindView } from "@/features/bind/views/bind.view";

/**
 * SSO 二级绑定页(OIDC IdP 回调 → 后端识别需绑定 → redirect 这里)。
 *
 * URL 入口参数(由后端 302 挂在 search):
 * - `token`:bind_token,凭据,只能在 useRef 持有(不入 store/log)
 * - `authcode`:traceability 用,前端不发送
 * - `return_to`:绑定成功后跳转目标(经 sanitizeReturnTo 限站内)
 * - `provider`:OIDC provider id
 *
 * 不在 validateSearch 里 zod 解析 — 因为 BindView mount 时立即 clearBindUrl
 * 清掉这些参数,zod 在重渲染后会拿到空。统一在 BindView 内用 `parseBindEntryParams`
 * 解析 + ref 持有(对齐老仓 BindModule.init 接 initialSearch 快照语义)。
 */

export const Route = createFileRoute("/bind")({
  component: function BindRouteComponent() {
    // location.search 在组件首次 mount 时还没被 clearBindUrl 清,直接传给 BindView
    const initialSearch = typeof window === "undefined" ? "" : window.location.search;
    return <BindView initialSearch={initialSearch} />;
  },
});
