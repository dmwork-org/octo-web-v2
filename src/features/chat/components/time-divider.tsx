interface TimeDividerProps {
  /** unix seconds */
  timestamp: number;
}

/**
 * 跨日分隔显示 `MM月DD日`(月日补 0,无时间),对齐旧 Messages/Time
 * `formatMessageTime` + Messages/Time/index.css 胶囊样式。
 *
 * **只**渲染日期(不含 HH:mm) — message-row 自己显示精确时间。
 * `message-list.shouldInsertDivider` 也已收窄为"仅跨日插",一天内多条消息
 * 只在跨日时插一个"MM月DD日"分隔(对齐旧 vm.ts:1756 同款逻辑)。
 */
function formatDateLabel(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}月${dd}日`;
}

/**
 * 时间分隔条 — 浅灰胶囊(对应旧 .wk-message-time):
 *   bg rgba(0,0,0,0.03) + radius-full + text-tertiary 11px + 2/10 padding
 */
export function TimeDivider({ timestamp }: TimeDividerProps) {
  return (
    <div className="flex justify-center py-3">
      <span className="rounded-full bg-[rgba(0,0,0,0.03)] px-2.5 py-0.5 text-[11px] leading-none font-medium text-text-tertiary">
        {formatDateLabel(timestamp)}
      </span>
    </div>
  );
}
