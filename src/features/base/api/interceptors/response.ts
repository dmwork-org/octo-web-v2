import type { FetchContext, FetchResponse } from "ofetch";
import type { Store } from "@tanstack/react-store";
import type { AuthState } from "@/features/base/stores/auth";
import { message } from "@/components/ui/message";
import { extractResponseErrorMessage } from "@/features/base/api/api-error";

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
    // 惰性 import 断开循环依赖:response → router → routeTree → matter-client → factory → response。
    // router 只在真正发生 401 重定向时才用到,无需在模块顶层静态引入。
    void import("@/lib/router").then(({ router }) => {
      void router.navigate({ href: `/login?redirect=${redirectTo}` });
    });
  };

/**
 * 全局错误 toast。调用方在 fetch options 传 `silent: true` 可跳过(自己接管错误提示)。
 *
 * **key 去重**(issue #74):同一份 message 短时间内只显一条,避免某个 endpoint
 * 周期失败时 toast 飘满屏幕(典型场景:某 SDK 周期 fetchChannelInfo 命中非法 uid
 * → 每次 re-render 都触发 → 400 → 默认无 key 时 toast 堆叠几十条)。
 *
 * 用法:
 *   api('/foo', { ...(silent ? { silent: true } : {}) } as FetchOptions & { silent?: boolean })
 *   或封装的 endpoint 函数透传 silent 选项。
 */
export const withErrorToast =
  () =>
  ({ response, options }: ResponseCtx) => {
    if ((options as { silent?: boolean }).silent) return;
    const msg = extractResponseErrorMessage(response);
    // 用 msg + status 当 key:相同错误同时间窗内只显一条
    message.error(msg, { key: `err:${response.status}:${msg}` });
  };
