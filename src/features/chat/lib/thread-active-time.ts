import type { ThreadRaw } from "@/features/base/api/endpoints/group.api";

type ThreadTimeFields = Pick<ThreadRaw, "last_message_at" | "updated_at" | "created_at">;

const DATE_TIME_WITHOUT_TIMEZONE_RE = /^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/;
const TIMEZONE_SUFFIX_RE = /(?:z|[+-]\d{2}:?\d{2})$/i;

export function threadActiveTime(thread: Partial<ThreadTimeFields>): string | undefined {
  return thread.last_message_at || thread.updated_at || thread.created_at;
}

export function parseThreadTimeMs(value?: string): number {
  if (!value) return 0;

  const normalized = normalizeThreadTime(value);
  const timestamp = Date.parse(normalized);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export function threadActiveTimeMs(thread: Partial<ThreadTimeFields>): number {
  return parseThreadTimeMs(threadActiveTime(thread));
}

function normalizeThreadTime(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || TIMEZONE_SUFFIX_RE.test(trimmed)) return trimmed;
  if (DATE_TIME_WITHOUT_TIMEZONE_RE.test(trimmed)) return `${trimmed.replace(" ", "T")}Z`;
  return trimmed;
}
