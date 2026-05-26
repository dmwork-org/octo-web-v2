import { queryOptions } from "@tanstack/react-query";
import { endpointStore } from "@/features/base/stores/endpoint";

/** 测一次的硬超时(同 fetch abort 用)。 */
const PING_TIMEOUT_MS = 4000;
/** 周期 5s,对齐旧 dmworkbase ConnectionStatus 同款节奏。 */
export const LATENCY_PING_INTERVAL_MS = 5000;

/**
 * IM 连接延迟 ping(对应旧 dmworkbase ConnectionStatus.measureLatency):
 *
 * GET ${baseURL}/health,记 round-trip ms。SDK 没暴露 ping API,旧版也走 HTTP /health。
 *
 * 通过 useQuery + refetchInterval 实现周期测量(走 query 不走 useEffect+fetch,
 * 满足 taste rule no-useeffect-fetch)。enabled 由调用方按 status 决定:仅在
 * imConnectionStore.status === "connected" 时跑。
 *
 * 失败/abort 让 query 进 error 态,UI 沿用上一次成功值或显示无延迟态(信号格灰)。
 */
async function fetchHealthLatency(baseURL: string): Promise<number> {
  const ctrl = new AbortController();
  const timeoutId = window.setTimeout(() => ctrl.abort(), PING_TIMEOUT_MS);
  const start = performance.now();
  try {
    await fetch(`${baseURL.replace(/\/+$/, "")}/health`, {
      method: "GET",
      cache: "no-cache",
      signal: ctrl.signal,
    });
    return Math.round(performance.now() - start);
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export function imLatencyQueryOptions(enabled: boolean) {
  // baseURL 走 store snapshot — endpoint 切换时 query key 变会自动重起
  const baseURL = endpointStore.state.baseURL;
  return queryOptions({
    queryKey: ["im", "latency-ping", baseURL] as const,
    queryFn: () => fetchHealthLatency(baseURL),
    enabled: enabled && !!baseURL,
    refetchInterval: LATENCY_PING_INTERVAL_MS,
    refetchIntervalInBackground: false,
    staleTime: 0,
    gcTime: 30 * 1000,
    retry: false,
  });
}
