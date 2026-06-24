const RAW_LLM_ERROR_RE = /^LLM error(?:\s|:)/i;

export function isRawAiServiceError(text: string): boolean {
  return RAW_LLM_ERROR_RE.test(text.trim());
}

export function safeAiServiceText(text: string, fallback: string): string {
  return isRawAiServiceError(text) ? fallback : text;
}
