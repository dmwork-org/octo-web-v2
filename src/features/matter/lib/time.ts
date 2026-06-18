export function formatMatterDateTime(input: string | Date): string {
  const date = typeof input === "string" ? new Date(input) : input;
  const month = String(date.getMonth() + 1);
  const day = String(date.getDate());
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${month}/${day} ${hours}:${minutes}`;
}

export function formatMatterTime(input: string | Date): string {
  const date = typeof input === "string" ? new Date(input) : input;
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function isSameMatterDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function formatMatterRelativeTime(
  iso: string,
  t: (key: string, params?: Record<string, unknown>) => string,
): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return t("matter.day.today");
  if (diffDays === 1) return t("matter.day.yesterday");
  if (diffDays < 30) return t("matter.time.daysAgo", { values: { count: diffDays } });
  if (diffDays < 365)
    return t("matter.time.monthsAgo", { values: { count: Math.floor(diffDays / 30) } });
  return t("matter.time.yearsAgo", { values: { count: Math.floor(diffDays / 365) } });
}
