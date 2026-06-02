import { useMemo } from "react";
import { useFileContent } from "@/features/chat/file-preview/hooks/use-file-content";
import { shouldFetchContent } from "@/features/chat/file-preview/config";
import {
  FileTooLarge,
  RendererEmpty,
  RendererError,
  RendererLoading,
} from "@/features/chat/file-preview/renderer-state";
import type { BaseRendererProps } from "@/features/chat/file-preview/types";

/**
 * Excel renderer — **仅支持 CSV**(对齐旧 registry.ts:`excel` type extensions=["csv"]):
 *   - 简版 CSV 解析:支持引号 `"..."` 包裹 + 双引号转义(`""` → `"`)
 *   - **不支持**跨行单元(99% 业务 case 不用,简化避免 state machine 复杂度)
 *   - 不引入 papaparse / xlsx(旧仓用 xlsx 是为了 xlsx/xls,但 registry 只
 *     注册了 csv;.xlsx/.xls 直接走 Fallback)
 *   - 表格视图:union 列 + 行,**>1000 行截断**(简化,不引虚拟滚动)
 */
const MAX_ROWS = 1000;

export function ExcelRenderer({ file }: BaseRendererProps) {
  const enabled = shouldFetchContent(file.size || 0);
  const { content, loading, error, reload } = useFileContent({ url: file.url, enabled });

  const rows = useMemo(() => parseCsv(content ?? ""), [content]);
  const oversize = !enabled;

  if (oversize) return <FileTooLarge name={file.name} size={file.size} url={file.url} />;
  if (loading) return <RendererLoading />;
  if (error) return <RendererError message={error} onRetry={reload} />;
  if (rows.length === 0) return <RendererEmpty message="CSV 为空或解析失败" />;

  // 第一行视为表头(CSV 常规约定)
  const header = rows[0];
  const dataRows = rows.slice(1);
  const truncated = dataRows.length > MAX_ROWS;
  const visible = truncated ? dataRows.slice(0, MAX_ROWS) : dataRows;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg-base">
      <div className="flex shrink-0 items-center justify-between border-b border-border-subtle bg-bg-surface px-3 py-1.5">
        <div className="flex items-center gap-2 text-[11px] text-text-tertiary">
          <span className="rounded-sm bg-bg-elevated px-1.5 py-0.5 font-medium text-text-secondary">
            CSV
          </span>
          <span>
            {header.length} 列 · {dataRows.length} 行
          </span>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-bg-elevated">
            <tr>
              {header.map((h, i) => (
                <th
                  key={i}
                  className="border-b border-border-default px-3 py-2 text-left font-medium text-text-secondary"
                >
                  {h || `列${i + 1}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, i) => (
              <tr key={i} className="border-b border-border-subtle hover:bg-bg-hover">
                {header.map((_, j) => (
                  <td
                    key={j}
                    className="max-w-[280px] truncate px-3 py-1.5 text-text-primary"
                    title={row[j] ?? ""}
                  >
                    {row[j] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="shrink-0 border-t border-border-subtle bg-bg-surface px-3 py-1 text-[11px] text-text-tertiary">
        {truncated ? `共 ${dataRows.length} 行,显示前 ${MAX_ROWS} 行` : `共 ${dataRows.length} 行`}
      </div>
    </div>
  );
}

/**
 * 简版 CSV parser:逐字符 state machine 处理引号转义。
 * - `"a,b"` → 单元 `a,b`
 * - `""` 在引号内 → 转义为字面 `"`
 * - 不支持单元内换行(`"a\nb"` 这种 99% 业务 case 不用)。
 */
function parseCsv(text: string): string[][] {
  if (!text) return [];
  const rows: string[][] = [];
  for (const line of text.split(/\r?\n/)) {
    if (line === "") continue;
    const cells: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') {
            cur += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          cur += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ",") {
          cells.push(cur);
          cur = "";
        } else {
          cur += ch;
        }
      }
    }
    cells.push(cur);
    rows.push(cells);
  }
  return rows;
}
