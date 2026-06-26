interface ApiErrorPayload {
  msg?: unknown;
  message?: unknown;
  error?: {
    msg?: unknown;
    message?: unknown;
  };
}

interface ApiErrorLike {
  data?: ApiErrorPayload;
  code?: string;
  response?: {
    _data?: ApiErrorPayload;
    statusText?: string;
  };
  message?: string;
  name?: string;
}

const RAW_FETCH_ERROR_RE = /^\[(GET|POST|PUT|PATCH|DELETE)\]\s+"[^"]+":\s+\d{3}/;
export type TransportErrorKind = "timeout" | "network";

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

function isSafeDisplayMessage(message: string): boolean {
  if (RAW_FETCH_ERROR_RE.test(message)) return false;
  if (message.length > 120) return false;
  return !/[<>{}]|Error:|at /.test(message);
}

function payloadMessage(data: ApiErrorPayload | undefined): string | undefined {
  return firstString(data?.msg, data?.message, data?.error?.msg, data?.error?.message);
}

export function classifyTransportError(error: unknown): TransportErrorKind | undefined {
  if (!error || typeof error !== "object") return undefined;
  const err = error as ApiErrorLike;
  const code = firstString(err.code);
  const message = firstString(err.message) ?? "";
  const name = firstString(err.name) ?? "";
  if (
    code === "ECONNABORTED" ||
    code === "ETIMEDOUT" ||
    code === "TIMEOUT" ||
    /timeout|timed out/i.test(message)
  ) {
    return "timeout";
  }
  if (
    code === "ERR_NETWORK" ||
    code === "FETCH_ERROR" ||
    /network\s*error|failed to fetch|load failed/i.test(message)
  ) {
    return "network";
  }
  if (name === "AbortError" && /timeout|timed out|aborted/i.test(message)) return "timeout";
  return undefined;
}

export function extractApiErrorMessage(error: unknown, fallback: string): string {
  if (classifyTransportError(error)) return fallback;
  if (!error || typeof error !== "object") return fallback;
  const err = error as ApiErrorLike;
  const message = firstString(
    payloadMessage(err.data),
    payloadMessage(err.response?._data),
    err.response?.statusText,
    err.message,
  );
  if (!message || !isSafeDisplayMessage(message)) return fallback;
  return message;
}

export function extractResponseErrorMessage(
  response: { _data?: unknown; statusText?: string; status?: number },
  fallback = "Request failed",
): string {
  const data = response._data as ApiErrorPayload | undefined;
  const message = firstString(payloadMessage(data), response.statusText);
  if (!message || !isSafeDisplayMessage(message)) return fallback;
  return message;
}
