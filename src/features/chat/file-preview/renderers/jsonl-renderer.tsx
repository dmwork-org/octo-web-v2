import { useMemo, useState } from "react";
import { Code, Table as TableIcon } from "lucide-react";
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

/**
 * JSONL renderer(对齐旧 JsonlRenderer):
 *   - viewMode toggle:**表格**(默认) | **代码**
 *   - 表格视图:union keys 做列,行渲染所有键(对象→ JSON.stringify),
 *     **简化**(不用 react-virtuoso 虚拟滚动):>1000 行截断显示前 1000 行,
 *     加底部"共 N 行,显示前 1000 行"提示
 *   - 代码视图:格式化每条 JSON(`// ---` 分隔)走 CommonCodeView highlight
 *   - too-large / loading / error 走 CommonCodeView 通用态
 *   - 单一 `value` 列(纯 scalar 数组)禁用表格视图,自动切代码视图
 */
const MAX_ROWS = 1000;

export function JsonlRenderer({ file }: BaseRendererProps) {
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

  if (rows.length === 0) return <RendererEmpty message="暂无内容或 JSONL 格式错误" />;

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
  return (
    <div className="flex shrink-0 items-center justify-between border-b border-border-subtle bg-bg-surface px-3 py-1.5">
      <div className="flex items-center gap-2 text-[11px] text-text-tertiary">
        <span className="rounded-sm bg-bg-elevated px-1.5 py-0.5 font-medium text-text-secondary">
          JSONL
        </span>
        <span>
          {lineCount} 行 · {validCount} 条有效
        </span>
      </div>
      <div className="flex items-center gap-0.5 rounded-md border border-border-subtle">
        <ViewBtn
          active={viewMode === "table"}
          disabled={!canShowTable}
          onClick={() => onChange("table")}
          title={canShowTable ? "表格视图" : "无法提取表格数据"}
        >
          <TableIcon size={12} />
          <span>表格</span>
        </ViewBtn>
        <ViewBtn active={viewMode === "code"} onClick={() => onChange("code")} title="代码视图">
          <Code size={12} />
          <span>代码</span>
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
          ? "bg-bg-elevated text-text-primary"
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
  const truncated = rows.length > MAX_ROWS;
  const visible = truncated ? rows.slice(0, MAX_ROWS) : rows;
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-bg-elevated">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className="border-b border-border-default px-3 py-2 text-left font-medium text-text-secondary"
                >
                  {c.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, i) => (
              <tr key={i} className="border-b border-border-subtle hover:bg-bg-hover">
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className="max-w-[280px] truncate px-3 py-1.5 text-text-primary"
                    title={renderCell(row[c.key])}
                  >
                    {renderCell(row[c.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="shrink-0 border-t border-border-subtle bg-bg-surface px-3 py-1 text-[11px] text-text-tertiary">
        {truncated ? `共 ${rows.length} 行,显示前 ${MAX_ROWS} 行` : `共 ${rows.length} 行`}
      </div>
    </div>
  );
}
