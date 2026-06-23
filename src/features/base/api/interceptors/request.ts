import type { FetchContext } from "ofetch";
import type { Store } from "@tanstack/react-store";
import type { AuthState } from "@/features/base/stores/auth";
import type { SpaceState } from "@/features/base/stores/space";
import { i18n } from "@/lib/i18n/instance";

function ensureHeaders(options: FetchContext["options"]): Headers {
  const headers = new Headers(options.headers as HeadersInit | undefined);
  options.headers = headers;
  return headers;
}

/**
 * 跟上游 `packages/dmworkbase/src/Service/apiLanguage.ts` 一致:
 * 当前 locale 排首位,其它候选降权回退,后端 i18n 走 Accept-Language header 协商。
 */
function buildAcceptLanguage(): string {
  if (i18n.getLocale() === "zh-CN") {
    return "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7";
  }
  return "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7";
}

export const withAuthToken =
  (store: Store<AuthState>) =>
  ({ options }: FetchContext) => {
    const token = store.state.token;
    if (!token) return;
    const headers = ensureHeaders(options);
    // 后端 wkhttp 中间件读自定义 `token` header(不接 Authorization: Bearer)。
    // 对照旧项目 packages/dmworkbase/src/Service/APIClient.ts initAxios()。
    headers.set("token", token);
  };

export const withSpaceHeader =
  (spaceStore: Store<SpaceState>, authStore: Store<AuthState>) =>
  ({ options }: FetchContext) => {
    // 无 token(匿名请求,如 /login / /sendcode / /loginuuid)不应带 X-Space-Id —
    // 否则后端会用残留 space 上下文路由匿名请求,导致 500。对齐老仓
    // logout 时清 spaceId 的语义(老仓 logout 之后 spaceIdCallback 返空,
    // interceptor 行 60-65 跳过 header 注入)。
    if (!authStore.state.token) return;
    const headers = ensureHeaders(options);
    // 允许调用方显式跳过 Space 过滤(issue #161):
    // BotFather 等 SYSTEM_BOTS 的消息同步需要拉取跨 Space 的全部历史,
    // 后端按 X-Space-Id 过滤会截断为仅当前 Space 消息,导致分页提前终止。
    // 调用方在 headers 里设 "X-No-Space-Filter": "1" 即可跳过注入,
    // 拦截器消费后删除该临时 header,不会发送到后端。
    if (headers.get("X-No-Space-Filter") === "1") {
      headers.delete("X-No-Space-Filter");
      return;
    }
    const spaceId = spaceStore.state.spaceId;
    if (!spaceId) return;
    headers.set("X-Space-Id", spaceId);
  };

export const withReqId =
  () =>
  ({ options }: FetchContext) => {
    const headers = ensureHeaders(options);
    headers.set("X-Request-Id", crypto.randomUUID());
  };

export const withAcceptLanguage =
  () =>
  ({ options }: FetchContext) => {
    const headers = ensureHeaders(options);
    if (!headers.has("Accept-Language")) {
      headers.set("Accept-Language", buildAcceptLanguage());
    }
  };
