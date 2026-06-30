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
 *
 * ## 关于 baseURL 路径(/matter/api/v1)
 *
 * 这里 "/matter" 是 nginx 反向代理的 tag(把请求转发到后端 todos service),
 * 与前端路由 `/matter` 视觉上"前缀相同",但其实是两个独立概念:
 *
 * - **路由** `/matter`  — 前端 TanStack Router 的页面 URL,跟 API 无关。
 * - **baseURL** `/matter/api/v1` — nginx 据此把 `/matter/api/v1/*` 转发到
 *   todos service(后端仍叫 todos,matter 是前端重命名后的概念)。生产线上
 *   `/matter/api/v1/matters/...` 返回 401/400 等业务响应(说明服务可达),
 *   而 `/api/v1/matters/...` 直接 404(nginx 没匹配那条规则)。
 *
 * baseURL 必须有 leading `/`,这样 ofetch 把它当绝对路径,浏览器按 origin
 * resolve,无论当前页面是 `/matter`、`/chat` 还是其他,fetch 出来永远是
 * `<origin>/matter/api/v1/matters`,不会出现 `/matter/matter/api/v1` 双前缀。
 */
export const matterApi = $fetch.create(
  createClientOptions({
    authStore,
    spaceStore,
    baseURL: "/matter/api/v1",
  }),
);
