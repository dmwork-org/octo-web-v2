interface TimeDividerProps {
  /** unix seconds */
  timestamp: number;
}

/** 把 unix 秒转成"今天 HH:mm" / "昨天 HH:mm" / "yyyy-MM-dd HH:mm"。 */
function formatDividerLabel(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yStart = new Date(todayStart.getTime() - 24 * 3600 * 1000);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  if (d >= todayStart) return `今天 ${hh}:${mm}`;
  if (d >= yStart) return `昨天 ${hh}:${mm}`;
  const sameYear = d.getFullYear() === now.getFullYear();
  if (sameYear) return `${d.getMonth() + 1}月${d.getDate()}日 ${hh}:${mm}`;
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()} ${hh}:${mm}`;
}

/**
 * 时间分隔条(对应旧 Messages/Time TimeContent + Messages/HistorySplit)。
 * 跨日 / 间隔 > 5 分钟 时由 message-list 计算后插入。
 */
export function TimeDivider({ timestamp }: TimeDividerProps) {
  return (
    <div className="flex justify-center py-2">
      <span className="text-[11px] leading-none text-text-tertiary">
        {formatDividerLabel(timestamp)}
      </span>
    </div>
  );
}
