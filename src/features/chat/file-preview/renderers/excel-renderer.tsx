import { useCallback, useEffect, useState } from "react";
import { TableVirtuoso } from "react-virtuoso";
import { useFileContent } from "@/features/chat/file-preview/hooks/use-file-content";
import { isFileTooLarge } from "@/features/chat/file-preview/config";
import {
  FileTooLarge,
  RendererEmpty,
  RendererError,
  RendererLoading,
} from "@/features/chat/file-preview/renderer-state";
import type { BaseRendererProps } from "@/features/chat/file-preview/types";
import { useT } from "@/lib/i18n/use-t";

/**
 * Excel renderer(1:1 对齐旧 dmworkbase ExcelRenderer):
 *   - 支持 **xlsx / xls / xlsb / xlsm / csv**(SheetJS `xlsx` 解析二进制工作簿)
 *   - 多工作表:底部 sheet tabs 切换
 *   - 虚拟滚动(react-virtuoso TableVirtuoso)高效渲染大表
 *   - 解析前裁剪尾部空行 + 右侧空列;重复列名用 Symbol key 去重
 *   - too-large(>20MB)/ loading / error / empty 兜底
 *
 * 注:arraybuffer 读取 → XLSX.read,csv 也走同一路径(SheetJS 原生支持 csv)。
 */

interface ColumnConfig {
  key: string | symbol;
  title: string;
}

interface SheetData {
  name: string;
  rows: Record<string | symbol, unknown>[];
  columns: ColumnConfig[];
}

/** 裁剪尾部空行 + 右侧空列(对齐老仓 trimEmptyRowsAndColumns)。 */
function trimEmptyRowsAndColumns(data: unknown[][]): unknown[][] {
  if (!data || data.length === 0) return data;
  const isEmpty = (cell: unknown) => cell === null || cell === undefined || cell === "";

  let lastRow = -1;
  for (let i = data.length - 1; i >= 0; i--) {
    if (data[i].some((c) => !isEmpty(c))) {
      lastRow = i;
      break;
    }
  }
  if (lastRow < 0) return [];
  const trimmedRows = data.slice(0, lastRow + 1);

  let lastCol = 0;
  for (const row of trimmedRows) {
    for (let i = row.length - 1; i >= 0; i--) {
      if (!isEmpty(row[i])) {
        lastCol = Math.max(lastCol, i);
        break;
      }
    }
  }
  return trimmedRows.map((row) => row.slice(0, lastCol + 1));
}

/** 解析工作簿为 SheetData[](对齐老仓 parseWorkbook:重复列名 Symbol 去重)。
 *  xlsx 库动态 import,不打进主 chunk(对齐老仓 lazy load,该库较大)。 */
async function parseWorkbook(buffer: ArrayBuffer): Promise<SheetData[]> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(new Uint8Array(buffer), {
    type: "array",
    codepage: 65001,
    raw: true,
  });

  return workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const json = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      defval: "",
      blankrows: true,
    }) as unknown[][];

    const trimmed = trimEmptyRowsAndColumns(json);
    const headers = trimmed.length > 0 ? (trimmed[0] as string[]) : [];

    const nameCount = new Map<string, number>();
    const columns: ColumnConfig[] = [];
    const keyByIndex = new Map<number, string | symbol>();
    headers.forEach((h, idx) => {
      const title = (h as string) || "-";
      const count = nameCount.get(title) ?? 0;
      nameCount.set(title, count + 1);
      // 重复列名用 Symbol 区分,避免对象 key 覆盖
      const key = count > 0 ? Symbol(title) : title;
      columns.push({ key, title });
      keyByIndex.set(idx, key);
    });

    const rows = trimmed.slice(1).map((row) => {
      const obj: Record<string | symbol, unknown> = {};
      (row as unknown[]).forEach((cell, idx) => {
        const key = keyByIndex.get(idx);
        if (key !== undefined) obj[key] = cell;
      });
      return obj;
    });

    return { name, rows, columns };
  });
}

function renderCell(value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function ExcelRenderer({ file, onError }: BaseRendererProps) {
  const t = useT();
  const isTooLarge = file.size != null && isFileTooLarge(file.size);

  const { content, loading, error, reload } = useFileContent({
    url: file.url,
    responseType: "arraybuffer",
    enabled: !isTooLarge,
  });

  const [sheets, setSheets] = useState<SheetData[]>([]);
  const [activeSheet, setActiveSheet] = useState(0);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);

  const parse = useCallback(
    async (buffer: ArrayBuffer) => {
      setParsing(true);
      setParseError(null);
      setSheets([]);
      setActiveSheet(0);
      try {
        const parsed = await parseWorkbook(buffer);
        if (parsed.length === 0) throw new Error(t("filePreview.excel.emptySheet"));
        setSheets(parsed);
      } catch (err) {
        const msg = err instanceof Error ? err.message : t("filePreview.excel.parseFailed");
        setParseError(msg);
        onError?.(msg);
      } finally {
        setParsing(false);
      }
    },
    [onError, t],
  );

  useParseOnContent(content, parse);

  if (isTooLarge) {
    return <FileTooLarge name={file.name} size={file.size} url={file.url} />;
  }
  if (loading || parsing) return <RendererLoading />;
  if (error || parseError) {
    return <RendererError message={error ?? parseError ?? ""} onRetry={reload} />;
  }
  if (sheets.length === 0) return <RendererEmpty />;

  const sheet = sheets[activeSheet] ?? sheets[0];
  // 文件类型徽标:csv 显 "CSV",其它(xlsx/xls/...)显 "EXCEL"
  const isCsv = (file.ext || "").toLowerCase() === "csv" || file.name.toLowerCase().endsWith(".csv");
  const badge = isCsv ? "CSV" : "EXCEL";
  const colsCount = sheet.columns.length;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg-base">
      {/* 顶部 toolbar:类型徽标 + 列/行统计(对齐 jsonl renderer 风格) */}
      <div className="flex shrink-0 items-center justify-between border-b border-border-subtle bg-bg-surface px-3 py-1.5">
        <div className="flex items-center gap-2 text-[11px] text-text-tertiary">
          <span className="rounded-sm bg-bg-elevated px-1.5 py-0.5 font-medium text-text-secondary">
            {badge}
          </span>
          <span>
            {t("filePreview.excel.colsRows", {
              values: { cols: colsCount, rows: sheet.rows.length },
            })}
          </span>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <SheetTable sheet={sheet} />
      </div>
      <div className="flex shrink-0 items-center gap-3 border-t border-border-subtle bg-bg-surface px-3 py-1">
        <span className="shrink-0 text-[11px] text-text-tertiary">
          {t("filePreview.rowsCount", { values: { count: sheet.rows.length } })}
        </span>
        {sheets.length > 1 ? (
          <div className="flex items-center gap-0.5 overflow-x-auto">
            {sheets.map((s, i) => (
              <button
                key={`${s.name}-${i}`}
                type="button"
                onClick={() => setActiveSheet(i)}
                title={s.name}
                className={`max-w-[120px] shrink-0 cursor-pointer truncate rounded-sm px-2 py-0.5 text-[11px] transition-colors ${
                  i === activeSheet
                    ? "bg-bg-elevated font-medium text-text-primary"
                    : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SheetTable({ sheet }: { sheet: SheetData }) {
  const t = useT();
  const { rows, columns } = sheet;
  if (rows.length === 0 || columns.length === 0) {
    return <RendererEmpty message={t("filePreview.empty")} />;
  }
  return (
    <TableVirtuoso
      data={rows}
      className="h-full"
      // 让内部 <table> 撑满容器宽度,避免列宽被内容挤在左侧、右侧大量留白。
      components={{
        Table: (props) => (
          <table {...props} className="w-full table-auto border-collapse text-xs" />
        ),
        TableRow: ({ ...props }) => (
          <tr
            {...props}
            className="bg-bg-surface transition-colors odd:bg-bg-base hover:bg-bg-hover"
          />
        ),
      }}
      fixedHeaderContent={() => (
        <tr className="bg-bg-elevated">
          {columns.map((col, i) => (
            <th
              key={i}
              className="border-b border-border-default bg-bg-elevated px-3 py-2 text-left text-xs font-semibold text-text-primary"
            >
              {col.title}
            </th>
          ))}
        </tr>
      )}
      itemContent={(_index, row) => (
        <>
          {columns.map((col, i) => {
            const text = renderCell(row[col.key]);
            return (
              <td
                key={i}
                className="max-w-[280px] truncate border-b border-border-subtle px-3 py-1.5 text-xs text-text-primary"
                title={text}
              >
                {text}
              </td>
            );
          })}
        </>
      )}
    />
  );
}

/**
 * content(arraybuffer)就绪后触发解析。抽到命名 hook 满足 no-useeffect-in-component。
 */
function useParseOnContent(
  content: ArrayBuffer | null,
  parse: (buf: ArrayBuffer) => Promise<void>,
): void {
  useEffect(() => {
    if (content) void parse(content);
  }, [content, parse]);
}
