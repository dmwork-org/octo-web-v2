import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const reportJsonPath = resolve(".jscpd/jscpd-report.json");
const reportHtmlPath = resolve(".jscpd/report.html");

if (!existsSync(reportJsonPath)) {
  throw new Error("jscpd JSON report not found. Run jscpd before generating the HTML report.");
}

const report = JSON.parse(readFileSync(reportJsonPath, "utf8"));
writeFileSync(reportHtmlPath, renderReport(report));
console.log(`jscpd HTML report generated: ${reportHtmlPath}`);

function renderReport(report) {
  const total = report.statistics?.total ?? {};
  const formats = Object.entries(report.statistics?.formats ?? {});
  const duplicates = report.duplicates ?? [];
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Code Duplication Report</title>
  <style>
${renderStyles()}
  </style>
</head>
<body>
  <header class="page-header">
    <div>
      <p class="eyebrow">jscpd report</p>
      <h1>Code Duplication Report</h1>
    </div>
    <div class="score">${formatPercent(total.percentage)}</div>
  </header>
  <main>
    <section class="stats-grid">
      ${renderStat("Files", total.sources)}
      ${renderStat("Lines", total.lines)}
      ${renderStat("Clones", total.clones)}
      ${renderStat("Duplicated Lines", `${formatNumber(total.duplicatedLines)} (${formatPercent(total.percentage)})`)}
    </section>
    <section class="panel">
      <h2>Formats</h2>
      <table>
        <thead>
          <tr>
            <th>Format</th>
            <th>Files</th>
            <th>Lines</th>
            <th>Clones</th>
            <th>Duplicated Lines</th>
            <th>Duplicated Tokens</th>
          </tr>
        </thead>
        <tbody>
          ${formats.map(([format, stats]) => renderFormatRow(format, stats)).join("")}
        </tbody>
      </table>
    </section>
    <section class="clone-list">
      <h2>Duplications</h2>
      ${duplicates.length ? duplicates.map((clone, index) => renderClone(clone, index)).join("") : '<p class="empty">No duplications found.</p>'}
    </section>
  </main>
</body>
</html>
`;
}

function renderStyles() {
  return `
    :root {
      color-scheme: light;
      --bg: #f6f8fb;
      --panel: #ffffff;
      --border: #d9e2ec;
      --muted: #64748b;
      --text: #172033;
      --code-bg: #f8fafc;
      --dup-bg: #fff7ed;
      --dup-line: #fb923c;
      --accent: #2563eb;
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--text); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .page-header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 2rem 2.5rem; background: var(--panel); border-bottom: 1px solid var(--border); }
    .eyebrow { margin: 0 0 0.25rem; color: var(--muted); font-size: 0.75rem; font-weight: 700; text-transform: uppercase; }
    h1 { margin: 0; font-size: 1.75rem; line-height: 1.2; }
    h2 { margin: 0 0 1rem; font-size: 1rem; }
    main { padding: 1.5rem 2.5rem 2.5rem; }
    .score { border-radius: 999px; background: #dbeafe; color: #1d4ed8; padding: 0.5rem 0.875rem; font-weight: 800; }
    .stats-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1rem; margin-bottom: 1.25rem; }
    .stat, .panel, .clone-card { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; }
    .stat { padding: 1rem; }
    .stat-label { color: var(--muted); font-size: 0.75rem; font-weight: 700; text-transform: uppercase; }
    .stat-value { margin-top: 0.375rem; font-size: 1.5rem; font-weight: 800; }
    .panel { padding: 1rem; margin-bottom: 1.25rem; overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    th, td { padding: 0.625rem 0.75rem; border-bottom: 1px solid #edf2f7; text-align: left; white-space: nowrap; }
    th { color: var(--muted); font-size: 0.75rem; text-transform: uppercase; }
    tr:last-child td { border-bottom: 0; }
    .clone-list { display: grid; gap: 1rem; }
    .clone-card { overflow: hidden; }
    .clone-summary { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.875rem 1rem; border: 0; background: var(--panel); color: inherit; text-align: left; cursor: pointer; }
    .clone-summary:hover { background: #f8fafc; }
    .clone-title { min-width: 0; font-weight: 700; overflow-wrap: anywhere; }
    .clone-meta { flex: none; color: var(--muted); font-size: 0.75rem; }
    details[open] .clone-summary { border-bottom: 1px solid var(--border); }
    .code-compare { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 1rem; padding: 1rem; }
    .code-pane { min-width: 0; border: 1px solid var(--border); border-radius: 6px; background: var(--code-bg); overflow: hidden; }
    .code-pane-title { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; padding: 0.5rem 0.75rem; background: #eef2f7; color: #334155; font-size: 0.75rem; font-weight: 700; overflow-wrap: anywhere; }
    .code-pane-file { min-width: 0; }
    .code-pane-badge { flex: none; border-radius: 999px; background: #fed7aa; color: #9a3412; padding: 0.125rem 0.5rem; font-size: 0.6875rem; font-weight: 800; text-transform: uppercase; }
    .code-pane-pre { margin: 0; padding: 0.75rem 0; overflow-x: auto; white-space: pre; font: 12px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; color: #1e293b; background: transparent; }
    .code-line { display: block; min-height: 1.35em; border-left: 3px solid transparent; padding-right: 0.75rem; }
    .code-line-duplicated { border-left-color: var(--dup-line); background: var(--dup-bg); }
    .code-line-no { display: inline-block; min-width: 3.75rem; margin-right: 0.75rem; color: #94a3b8; user-select: none; text-align: right; }
    .code-keyword { color: #7c3aed; font-weight: 700; }
    .code-string { color: #15803d; }
    .code-comment { color: #64748b; font-style: italic; }
    .code-number { color: #b45309; }
    .code-tag { color: #1d4ed8; }
    .empty { margin: 0; color: var(--muted); }
    @media (max-width: 1024px) {
      .stats-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .code-compare { grid-template-columns: 1fr; }
    }
    @media (max-width: 640px) {
      .page-header, main { padding-left: 1rem; padding-right: 1rem; }
      .stats-grid { grid-template-columns: 1fr; }
      .clone-summary { align-items: flex-start; flex-direction: column; }
    }
  `;
}

function renderStat(label, value) {
  return `<div class="stat"><div class="stat-label">${escapeHtml(label)}</div><div class="stat-value">${escapeHtml(formatNumber(value))}</div></div>`;
}

function renderFormatRow(format, stats) {
  return `<tr>
    <td>${escapeHtml(format)}</td>
    <td>${formatNumber(stats.sources)}</td>
    <td>${formatNumber(stats.lines)}</td>
    <td>${formatNumber(stats.clones)}</td>
    <td>${formatNumber(stats.duplicatedLines)} (${formatPercent(stats.percentage)})</td>
    <td>${formatNumber(stats.duplicatedTokens)} (${formatPercent(stats.percentageTokens)})</td>
  </tr>`;
}

function renderClone(clone, index) {
  const firstLines = readSnippetLines(clone.firstFile);
  const secondLines = readSnippetLines(clone.secondFile);
  const { firstDuplicated, secondDuplicated } = findDuplicatedLineIndexes(firstLines, secondLines);
  const title = `${clone.firstFile.name} ↔ ${clone.secondFile.name}`;
  return `<details class="clone-card"${index === 0 ? " open" : ""}>
    <summary class="clone-summary">
      <span class="clone-title">${escapeHtml(title)}</span>
      <span class="clone-meta">${escapeHtml(clone.format)} · ${formatNumber(clone.lines)} lines · ${formatNumber(clone.tokens)} tokens</span>
    </summary>
    <div class="code-compare">
      ${renderPane(clone.firstFile, firstLines, firstDuplicated)}
      ${renderPane(clone.secondFile, secondLines, secondDuplicated)}
    </div>
  </details>`;
}

function renderPane(file, lines, duplicatedLineIndexes) {
  return `<div class="code-pane"><div class="code-pane-title"><span class="code-pane-file">${escapeHtml(file.name)}:${file.start}-${file.end}</span><span class="code-pane-badge">matched</span></div><pre class="code-pane-pre">${renderCode(file, lines, duplicatedLineIndexes)}</pre></div>`;
}

function renderCode(file, lines, duplicatedLineIndexes) {
  const width = String(file.end).length;
  return lines
    .map((line, offset) => {
      const lineNo = String(file.start + offset).padStart(width, " ");
      const className = duplicatedLineIndexes.has(offset)
        ? "code-line code-line-duplicated"
        : "code-line";
      return `<span class="${className}"><span class="code-line-no">${lineNo}</span>${highlightLine(line)}</span>`;
    })
    .join("");
}

function readSnippetLines(file) {
  const path = resolveReportPath(file.name);
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  return lines.slice(file.start - 1, file.end);
}

function findDuplicatedLineIndexes(firstLines, secondLines) {
  const firstNormalized = firstLines.map(normalizeComparableLine);
  const secondNormalized = secondLines.map(normalizeComparableLine);
  const matrix = Array.from({ length: firstLines.length + 1 }, () =>
    Array(secondLines.length + 1).fill(0),
  );

  for (let i = firstLines.length - 1; i >= 0; i -= 1) {
    for (let j = secondLines.length - 1; j >= 0; j -= 1) {
      matrix[i][j] =
        firstNormalized[i] && firstNormalized[i] === secondNormalized[j]
          ? matrix[i + 1][j + 1] + 1
          : Math.max(matrix[i + 1][j], matrix[i][j + 1]);
    }
  }

  const firstDuplicated = new Set();
  const secondDuplicated = new Set();
  let i = 0;
  let j = 0;
  while (i < firstLines.length && j < secondLines.length) {
    if (firstNormalized[i] && firstNormalized[i] === secondNormalized[j]) {
      firstDuplicated.add(i);
      secondDuplicated.add(j);
      i += 1;
      j += 1;
    } else if (matrix[i + 1][j] >= matrix[i][j + 1]) {
      i += 1;
    } else {
      j += 1;
    }
  }

  return { firstDuplicated, secondDuplicated };
}

function normalizeComparableLine(line) {
  const normalized = line.trim().replace(/\s+/g, " ");
  if (
    !normalized ||
    normalized.startsWith("//") ||
    normalized.startsWith("/*") ||
    normalized.startsWith("*") ||
    normalized.startsWith("*/")
  ) {
    return "";
  }
  return normalized;
}

function highlightLine(line) {
  const commentIndex = line.indexOf("//");
  if (commentIndex >= 0) {
    return `${highlightCodePart(line.slice(0, commentIndex))}<span class="code-comment">${escapeHtml(line.slice(commentIndex))}</span>`;
  }
  return highlightCodePart(line);
}

function highlightCodePart(value) {
  const tokens =
    /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b(?:const|let|var|function|return|if|else|for|while|switch|case|break|continue|import|from|export|default|type|interface|class|extends|new|async|await|try|catch|throw|true|false|null|undefined)\b|\b\d+(?:\.\d+)?\b|<\/?[A-Z][A-Za-z0-9.]*)/g;
  return value
    .split(tokens)
    .filter((part) => part.length > 0)
    .map((part) => {
      if (/^["'`]/.test(part)) return `<span class="code-string">${escapeHtml(part)}</span>`;
      if (/^<\/?[A-Z]/.test(part)) return `<span class="code-tag">${escapeHtml(part)}</span>`;
      if (/^\d/.test(part)) return `<span class="code-number">${escapeHtml(part)}</span>`;
      if (isKeyword(part)) return `<span class="code-keyword">${escapeHtml(part)}</span>`;
      return escapeHtml(part);
    })
    .join("");
}

function isKeyword(value) {
  return /^(const|let|var|function|return|if|else|for|while|switch|case|break|continue|import|from|export|default|type|interface|class|extends|new|async|await|try|catch|throw|true|false|null|undefined)$/.test(
    value,
  );
}

function resolveReportPath(name) {
  const candidates = [resolve(name), resolve("src", name), resolve("scripts", name)];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error(`Unable to resolve source file from jscpd report: ${name}`);
  return found;
}

function formatNumber(value) {
  if (value == null) return "-";
  if (typeof value === "number") return new Intl.NumberFormat("en-US").format(value);
  return String(value);
}

function formatPercent(value) {
  if (typeof value !== "number") return "-";
  return `${value.toFixed(2)}%`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
