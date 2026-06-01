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
