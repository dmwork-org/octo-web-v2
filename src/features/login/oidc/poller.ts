import {
  getOidcAuthStatus,
  OIDC_AUTH_STATUS,
  OIDC_POLL_INTERVAL_MS,
  OIDC_POLL_MAX_ATTEMPTS,
  OIDC_POLL_MAX_CONSECUTIVE_ERRORS,
  type OidcAuthStatusResp,
} from "@/features/base/api/endpoints/oidc.api";

/**
 * OIDC 状态轮询(对齐老仓 dmworklogin/src/oidc/poller.ts):
 *
 * - 2s 间隔(`OIDC_POLL_INTERVAL_MS`)/ 最大 150 次(5 分钟,`OIDC_POLL_MAX_ATTEMPTS`)
 * - 连续 10 次网络错误后抛 `OidcPollNetworkError`(`OIDC_POLL_MAX_CONSECUTIVE_ERRORS`)
 * - timeout 抛 `OidcPollTimeoutError`(用户长时间没在 IdP 完成)
 * - 外部 cancel(组件 unmount / 用户点 取消)通过 `AbortSignal` + `isCancelled`
 *   双通道:signal abort 中断 in-flight fetch(不等 RTT);isCancelled 在每轮
 *   开头检查兜底。中断后抛 `OidcPollCancelledError`。
 * - 收到 SUCCESS(1) 或 FAILED(2) 立即返回(view 处理 result / msg)。
 */

export class OidcPollTimeoutError extends Error {
  constructor() {
    super("OIDC login polling timed out");
    this.name = "OidcPollTimeoutError";
  }
}

export class OidcPollCancelledError extends Error {
  constructor() {
    super("OIDC login polling cancelled");
    this.name = "OidcPollCancelledError";
  }
}

export class OidcPollNetworkError extends Error {
  public readonly cause: unknown;
  constructor(cause: unknown) {
    super("OIDC login polling failed after repeated network errors");
    this.name = "OidcPollNetworkError";
    this.cause = cause;
  }
}

export interface PollAuthStatusOptions {
  authcode: string;
  /** 每轮 sleep 的实现(默认 setTimeout,可注入便于测试)。 */
  sleep?: (ms: number) => Promise<void>;
  isCancelled?: () => boolean;
  /** 由 view 持 AbortController,组件 unmount 时调 .abort()。 */
  signal?: AbortSignal;
  intervalMs?: number;
  maxAttempts?: number;
  maxConsecutiveErrors?: number;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function checkCancelled(opts: PollAuthStatusOptions): boolean {
  if (opts.isCancelled?.()) return true;
  if (opts.signal?.aborted) return true;
  return false;
}

export async function pollAuthStatus(opts: PollAuthStatusOptions): Promise<OidcAuthStatusResp> {
  const intervalMs = opts.intervalMs ?? OIDC_POLL_INTERVAL_MS;
  const maxAttempts = opts.maxAttempts ?? OIDC_POLL_MAX_ATTEMPTS;
  const maxErrors = opts.maxConsecutiveErrors ?? OIDC_POLL_MAX_CONSECUTIVE_ERRORS;
  const sleep = opts.sleep ?? defaultSleep;
  let consecutiveErrors = 0;
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (checkCancelled(opts)) throw new OidcPollCancelledError();
    try {
      const resp = await getOidcAuthStatus(opts.authcode);
      consecutiveErrors = 0;
      if (resp.status === OIDC_AUTH_STATUS.SUCCESS || resp.status === OIDC_AUTH_STATUS.FAILED) {
        return resp;
      }
    } catch (err) {
      // 由 cancel signal 触发的 abort 不应污染网络错误计数 — 直接当 cancel 处理
      if (checkCancelled(opts)) throw new OidcPollCancelledError();
      consecutiveErrors++;
      lastError = err;
      if (consecutiveErrors >= maxErrors) {
        throw new OidcPollNetworkError(lastError);
      }
    }
    if (attempt < maxAttempts - 1) {
      await sleep(intervalMs);
    }
  }
  throw new OidcPollTimeoutError();
}
