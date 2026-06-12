/** Matter 表单(CreateMatterModal / SmartCreateModal extract 路径)共用的纯函数 + 类型。
 *  .ts(非 .tsx)以满足 react-refresh/only-export-components。 */

export interface MatterFormValues {
  title: string;
  description: string;
  assigneeUids: string[];
  /** YYYY-MM-DD;未填时空串。 */
  deadline: string;
}

/** YYYY-MM-DD 字符串 + 本地 23:59:59 + 时区偏移 → 后端 deadline ISO 串(对齐旧 toLocalDateString)。 */
export function buildDeadlineISO(dateStr: string): string {
  const off = new Date().getTimezoneOffset();
  const sign = off <= 0 ? "+" : "-";
  const hh = String(Math.floor(Math.abs(off) / 60)).padStart(2, "0");
  const mm = String(Math.abs(off) % 60).padStart(2, "0");
  return `${dateStr}T23:59:59${sign}${hh}:${mm}`;
}

/** 今日 YYYY-MM-DD(本地时区)。 */
export function todayDateStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** YYYY-MM-DD 字符串 → 本地时区 Date(午夜)。空串返回 undefined。
 *  注意:不能用 new Date("2026-01-01"),它按 UTC 解析会偏一天,这里按本地构造。 */
export function parseDateStr(dateStr: string): Date | undefined {
  if (!dateStr) return undefined;
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}

/** 本地 Date → YYYY-MM-DD 字符串(对齐 todayDateStr 口径)。 */
export function formatDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 4 字段全填校验(给调用方用)。 */
export function isMatterFormValid(v: MatterFormValues): boolean {
  return !!(v.title.trim() && v.description.trim() && v.assigneeUids.length > 0 && v.deadline);
}
