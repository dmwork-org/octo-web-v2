import { useMemo, useState } from "react";
import { Code, Table as TableIcon } from "lucide-react";
import { TableVirtuoso } from "react-virtuoso";
import { useCodeRenderer } from "@/features/chat/file-preview/hooks/use-code-renderer";
import {
  countJsonlLines,
  extractColumns,
  formatJsonl,
  parseJsonl,
  renderCell,
} from "@/features/chat/file-preview/json-utils";
import { CommonCodeView } from "@/features/chat/file-preview/renderers/common-code-view";
import { RendererEmpty } from "@/features/chat/file-preview/renderer-state";
import type { BaseRendererProps } from "@/features/chat/file-preview/types";
import { useT } from "@/lib/i18n/use-t";

/**
 * JSONL renderer(对齐旧 JsonlRenderer):
 *   - viewMode toggle:**表格**(默认) | **代码**
 *   - 表格视图:union keys 做列,行渲染所有键(对象→ JSON.stringify),
 *     **虚拟滚动**(react-virtuoso TableVirtuoso)全量高效渲染,不截断(对齐老仓)
 *   - 代码视图:格式化每条 JSON(`// ---` 分隔)走 CommonCodeView highlight
 *   - too-large / loading / error 走 CommonCodeView 通用态
 *   - 单一 `value` 列(纯 scalar 数组)禁用表格视图,自动切代码视图
 */

export function JsonlRenderer({ file }: BaseRendererProps) {
  const t = useT();
  const { content, loading, error, reload, renderMode, fileSize, contentSize } = useCodeRenderer(
    file,
    { formatter: (raw) => formatJsonl(raw) },
  );

  const rows = useMemo(() => parseJsonl(content ?? ""), [content]);
  const columns = useMemo(() => extractColumns(rows), [rows]);
  const lineCount = useMemo(() => countJsonlLines(content ?? ""), [content]);
  const canShowTable =
    rows.length > 0 && columns.length > 0 && !(columns.length === 1 && columns[0].key === "value");
  const [viewMode, setViewMode] = useState<"table" | "code">("table");
  const effectiveMode = canShowTable ? viewMode : "code";

  // too-large / loading / error 复用 CommonCodeView
  if (loading || error || renderMode === "too-large") {
    return (
      <CommonCodeView
        file={file}
        renderMode={renderMode}
        formattedContent={content ?? ""}
        language="json"
        loading={loading}
        error={error}
        onReload={reload}
        fileSize={fileSize}
        contentSize={contentSize}
      />
    );
  }

  if (rows.length === 0) return <RendererEmpty message={t("filePreview.jsonl.emptyOrInvalid")} />;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg-base">
      <Toolbar
        viewMode={effectiveMode}
        onChange={setViewMode}
        canShowTable={canShowTable}
        lineCount={lineCount}
        validCount={rows.length}
      />
      {effectiveMode === "table" ? (
        <JsonlTable rows={rows} columns={columns} />
      ) : (
        <CommonCodeView
          file={file}
          renderMode={renderMode}
          formattedContent={formatJsonl(content ?? "")}
          language="json"
          loading={false}
          error={null}
          onReload={reload}
          fileSize={fileSize}
          contentSize={contentSize}
        />
      )}
    </div>
  );
}

function Toolbar({
  viewMode,
  onChange,
  canShowTable,
  lineCount,
  validCount,
}: {
  viewMode: "table" | "code";
  onChange: (m: "table" | "code") => void;
  canShowTable: boolean;
  lineCount: number;
  validCount: number;
}) {
  const t = useT();
  return (
    <div className="flex shrink-0 items-center justify-between border-b border-border-subtle bg-bg-surface px-3 py-1.5">
      <div className="flex items-center gap-2 text-[11px] text-text-tertiary">
        <span className="rounded-sm bg-bg-elevated px-1.5 py-0.5 font-medium text-text-secondary">
          JSONL
        </span>
        <span>
          {t("filePreview.jsonl.stats", { values: { lines: lineCount, records: validCount } })}
        </span>
      </div>
      <div className="flex items-center gap-0.5 rounded-md border border-border-subtle bg-bg-elevated">
        <ViewBtn
          active={viewMode === "table"}
          disabled={!canShowTable}
          onClick={() => onChange("table")}
          title={
            canShowTable
              ? t("filePreview.jsonl.tableView")
              : t("filePreview.jsonl.cannotExtractTable")
          }
        >
          <TableIcon size={12} />
          <span>{t("filePreview.jsonl.table")}</span>
        </ViewBtn>
        <ViewBtn
          active={viewMode === "code"}
          onClick={() => onChange("code")}
          title={t("filePreview.jsonl.codeView")}
        >
          <Code size={12} />
          <span>{t("filePreview.jsonl.code")}</span>
        </ViewBtn>
      </div>
    </div>
  );
}

function ViewBtn({
  active,
  disabled,
  onClick,
  title,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex cursor-pointer items-center gap-1 px-2 py-1 text-[11px] transition-colors disabled:cursor-default disabled:opacity-40 ${
        active
          ? "bg-bg-surface text-text-primary shadow-sm"
          : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
      }`}
    >
      {children}
    </button>
  );
}

function JsonlTable({
  rows,
  columns,
}: {
  rows: Record<string, unknown>[];
  columns: { key: string; title: string }[];
}) {
  const t = useT();
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* 虚拟滚动表格(对齐老仓 TableVirtuoso):全量数据高效渲染,不截断 */}
      <TableVirtuoso
        data={rows}
        className="flex-1"
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
            {columns.map((c) => (
              <th
                key={c.key}
                className="border-b border-border-default bg-bg-elevated px-3 py-2 text-left text-xs font-semibold text-text-primary"
              >
                {c.title}
              </th>
            ))}
          </tr>
        )}
        itemContent={(_index, row) => (
          <>
            {columns.map((c) => (
              <td
                key={c.key}
                className="max-w-[280px] truncate border-b border-border-subtle px-3 py-1.5 text-xs text-text-primary"
                title={renderCell(row[c.key])}
              >
                {renderCell(row[c.key])}
              </td>
            ))}
          </>
        )}
      />
      <div className="shrink-0 border-t border-border-subtle bg-bg-surface px-3 py-1 text-[11px] text-text-tertiary">
        {t("filePreview.rowsCount", { values: { count: rows.length } })}
      </div>
    </div>
  );
}
