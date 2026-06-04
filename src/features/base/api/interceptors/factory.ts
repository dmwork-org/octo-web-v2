import type { FetchOptions } from "ofetch";
import type { Store } from "@tanstack/react-store";
import type { AuthState } from "@/features/base/stores/auth";
import type { SpaceState } from "@/features/base/stores/space";
import { withAuthToken, withSpaceHeader, withReqId } from "./request";
import { with401Redirect, withErrorToast } from "./response";

/**
 * 拦截器工厂:把 5 个独立 interceptor 组合成 FetchOptions,供多个 ofetch client 共享。
 *
 * 主 client(`features/base/api/client.ts`,baseURL = endpointStore.baseURL)和
 * matter client(`features/matter/api/matter-client.ts`,baseURL = /matter/api/v1)
 * 共用同一组 onRequest / onResponseError,确保:
 * - auth token / X-Space-Id / X-Request-Id 在所有业务请求里行为一致
 * - 401 自动重定向 + errorToast 统一兜底
 *
 * 调用方传 baseURL,store 引用从外面传(便于测试 mock)。
 */
export function createClientOptions(args: {
  authStore: Store<AuthState>;
  spaceStore: Store<SpaceState>;
  baseURL: string;
}): FetchOptions {
  const { authStore, spaceStore, baseURL } = args;
  return {
    baseURL,
    onRequest: [withAuthToken(authStore), withSpaceHeader(spaceStore, authStore), withReqId()],
    onResponseError: [with401Redirect(authStore), withErrorToast()],
  };
}
