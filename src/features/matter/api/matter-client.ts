import { $fetch } from "ofetch";
import { authStore } from "@/features/base/stores/auth";
import { spaceStore } from "@/features/base/stores/space";
import { createClientOptions } from "@/features/base/api/interceptors/factory";

/**
 * Matter 服务专用 ofetch instance,baseURL = `/matter/api/v1`。
 *
 * Matter 服务独立部署,prefix 与 IM 主接口 `/v1/*` 不同,因此走独立 client。
 * 拦截器与主 client 完全一致(共用 createClientOptions 工厂):
 *   onRequest:      withAuthToken / withSpaceHeader / withReqId
 *   onResponseError: with401Redirect / withErrorToast
 *
 * 关键:**不**走 ofetch 内联 onRequest,以免与主 client 的 401 / errorToast 行为
 * 出现分歧。任何 matter endpoint 必须 import { matterApi } from this file。
 */
export const matterApi = $fetch.create(
  createClientOptions({
    authStore,
    spaceStore,
    baseURL: "/matter/api/v1",
  }),
);
