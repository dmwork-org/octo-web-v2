/**
 * JSON / JSONL 公共工具(1:1 对齐旧 Components/FilePreviewPanel/renderers/json-utils.ts)。
 */

export interface ColumnConfig {
  key: string;
  title: string;
}

export type JsonViewMode = "code" | "table";

export function safeJsonParse<T>(text: string | null | undefined, fallback: T): T {
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

/**
 * JSONL 解析:逐行 parse,非对象包装成 `{ value }`,跳过非法行。
 */
export function parseJsonl(content: string): Record<string, unknown>[] {
  if (!content) return [];
  const out: Record<string, unknown>[] = [];
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const parsed = safeJsonParse<unknown>(line, null);
    if (parsed === null) continue;
    if (typeof parsed === "object" && !Array.isArray(parsed)) {
      out.push(parsed as Record<string, unknown>);
    } else {
      out.push({ value: parsed });
    }
  }
  return out;
}

/**
 * JSONL 格式化:每行单独 stringify(_, 2),用 `// ---` 分隔(对齐旧 formatJsonl)。
 */
export function formatJsonl(content: string): string {
  if (!content) return "";
  const out: string[] = [];
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const parsed = safeJsonParse<unknown>(line, null);
    if (parsed !== null) {
      try {
        out.push(JSON.stringify(parsed, null, 2));
      } catch {
        out.push(line);
      }
    } else {
      out.push(line);
    }
  }
  return out.join("\n\n// ---\n\n");
}

/** 从数据行中提取所有键的合集做 column(对齐旧 extractColumns)。 */
export function extractColumns(rows: Record<string, unknown>[]): ColumnConfig[] {
  if (rows.length === 0) return [];
  const keys = new Set<string>();
  for (const r of rows) {
    if (r && typeof r === "object") {
      for (const k of Object.keys(r)) keys.add(k);
    }
  }
  return Array.from(keys).map((k) => ({ key: k, title: k }));
}

/** 统计 JSONL 有效行数(对齐旧 countJsonlLines)。 */
export function countJsonlLines(content: string): number {
  if (!content) return 0;
  return content.split(/\r?\n/).filter((l) => l.trim() !== "").length;
}

/** 单元格 unknown → 显示字符串。 */
export function renderCell(value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "object") return JSON.stringify(value);
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return `${value}`;
  }
  if (typeof value === "symbol") return value.description ?? "";
  return "-";
}
