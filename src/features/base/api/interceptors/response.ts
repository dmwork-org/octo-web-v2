import type { FetchContext, FetchResponse } from "ofetch";
import type { Store } from "@tanstack/react-store";
import type { AuthState } from "@/features/base/stores/auth";
import { toast } from "@/components/semi-bridge/toast";
import { router } from "@/lib/router";

type ResponseCtx = FetchContext & { response: FetchResponse<unknown> };

export const with401Redirect =
  (store: Store<AuthState>) =>
  ({ response }: ResponseCtx) => {
    if (response.status !== 401) return;
    store.setState(() => ({ token: null, user: null }));
    // 已经在 /login 路径(用户主动登出 / 登录页匿名请求 401)就不再 navigate —
    // 避免给 /login 加 ?redirect=<刚才的页面>:这是 token 过期场景才需要的行为,
    // 用户主动登出后残留 refetch 拿 401 不应被当成过期处理。
    if (typeof window !== "undefined" && window.location.pathname === "/login") return;
    const redirectTo = encodeURIComponent(window.location.href);
    void router.navigate({ href: `/login?redirect=${redirectTo}` });
  };

/**
 * 全局错误 toast。调用方在 fetch options 传 `silent: true` 可跳过(自己接管错误提示)。
 *
 * 用法:
 *   api('/foo', { ...(silent ? { silent: true } : {}) } as FetchOptions & { silent?: boolean })
 *   或封装的 endpoint 函数透传 silent 选项。
 */
export const withErrorToast =
  () =>
  ({ response, options }: ResponseCtx) => {
    if ((options as { silent?: boolean }).silent) return;
    const data = response._data as { message?: string; msg?: string } | undefined;
    const msg = data?.message ?? data?.msg ?? response.statusText ?? "Request failed";
    toast.error(msg);
  };
