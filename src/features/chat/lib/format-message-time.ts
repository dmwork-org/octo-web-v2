import { t } from "@/lib/i18n/instance";

/**
 * 聊天消息行时间格式化 — 1:1 对齐上游 `c1eaadca` formatMessageTimestamp:
 *
 * - 今天 → `HH:mm`
 * - 昨天 → `昨天 HH:mm`
 * - 一周内 → `周X HH:mm`(weekday short)
 * - 今年 → `MM-DD HH:mm`
 * - 跨年 → `YYYY-MM-DD HH:mm`
 *
 * fold session expanded / AI history footer / message row sender time 共用,
 * 避免老仓"AI 历史时间格式跟主消息行不一致"的 #301 bug。
 *
 * `ts` 是秒级 timestamp(WK SDK 风格);若传毫秒级会自动识别(> 10^10)。
 */
const WEEKDAY_FORMATTER = new Intl.DateTimeFormat("en-US", { weekday: "short" });

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatMessageTimeShort(ts: number): string {
  if (!ts) return "";
  const ms = ts < 10_000_000_000 ? ts * 1000 : ts;
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function formatMessageTimestamp(ts: number): string {
  if (!ts) return "";
  const ms = ts < 10_000_000_000 ? ts * 1000 : ts;
  const d = new Date(ms);
  const now = new Date();
  const hhmm = formatMessageTimeShort(ts);

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (sameDay(d, now)) return hhmm;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (sameDay(d, yesterday)) {
    return t("messageRow.yesterdayTime", { values: { time: hhmm } });
  }

  const deltaDays = Math.abs(now.getTime() - d.getTime()) / 86_400_000;
  if (deltaDays < 7) return `${WEEKDAY_FORMATTER.format(d)} ${hhmm}`;

  const mm = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  if (d.getFullYear() === now.getFullYear()) return `${mm}-${dd} ${hhmm}`;
  return `${d.getFullYear()}-${mm}-${dd} ${hhmm}`;
}
