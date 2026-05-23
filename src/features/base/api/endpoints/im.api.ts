import { api } from "@/features/base/api/client";

/**
 * 拉取当前用户的 IM 网关 ws/wss 地址。
 *
 * 后端契约(对应旧项目 `WKApp.dataSource.commonDataSource.imConnectAddrs`):
 *   GET /v1/users/{uid}/im → { wss_addr?: string, ws_addr?: string }
 *   优先用 wss_addr,fallback 到 ws_addr。
 *
 * 旧实现 `packages/dmworkdatasource/src/datasource.ts:imConnectAddrs` —
 * 这里保留"返回数组"的契约,允许后续做 round-robin 容灾。
 */

interface ImAddrsResp {
  wss_addr?: string;
  ws_addr?: string;
}

export async function getImConnectAddrs(uid: string): Promise<string[]> {
  const resp = await api<ImAddrsResp>(`users/${uid}/im`);
  const addr = resp.wss_addr || resp.ws_addr;
  return addr ? [addr] : [];
}
