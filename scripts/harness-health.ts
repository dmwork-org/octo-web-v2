#!/usr/bin/env node
/**
 * scripts/harness-health.ts — 聚合 trace jsonl → markdown 周报
 *
 * 读 .ai/traces/<date>/*.jsonl,聚合:
 *   - 总运行数 + pass@1
 *   - per-eval pass 率
 *   - 平均 duration_ms
 *   - 总 cost_usd(live 模式)
 *   - backlog 积压(count >= 2 的候选数)
 *
 * 用法:
 *   pnpm run harness-health                  # 聚合所有日期,stdout markdown
 *   pnpm run harness-health --days 7         # 最近 7 天
 *   pnpm run harness-health --json           # JSON 输出
 *   pnpm run harness-health --out report.md  # 写文件
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const PROJECT_ROOT = path.resolve(path.dirname(__filename), "..");
const TRACES_DIR = path.join(PROJECT_ROOT, ".ai/traces");
const BACKLOG_PATH = path.join(PROJECT_ROOT, ".ai/evals/backlog.md");

interface TraceLine {
  ts: string;
  eval_id: string;
  attempt: number;
  result: "pass" | "fail";
  duration_ms: number;
  cost_usd: number;
  token_in: number;
  token_out: number;
  mode: "mvp" | "live";
  [k: string]: unknown;
}

interface CliArgs {
  days?: number;
  json: boolean;
  out?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--json") args.json = true;
    else if (a === "--days") args.days = Number(argv[++i]);
    else if (a === "--out") args.out = argv[++i];
    else if (a.startsWith("--")) throw new Error(`unknown flag: ${a}`);
  }
  return args;
}

const NON_EVAL_FILES = new Set(["pre-tool-use.jsonl", "backlog-events.jsonl"]);

function isEvalLine(obj: unknown): obj is TraceLine {
  if (!obj || typeof obj !== "object") return false;
  const o = obj as Record<string, unknown>;
  return typeof o["eval_id"] === "string" && (o["result"] === "pass" || o["result"] === "fail");
}

function collectTraces(days?: number): TraceLine[] {
  if (!fs.existsSync(TRACES_DIR)) return [];
  const dateDirs = fs.readdirSync(TRACES_DIR).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  const cutoff = typeof days === "number" ? Date.now() - days * 86400_000 : 0;

  const lines: TraceLine[] = [];
  for (const d of dateDirs) {
    const ts = new Date(`${d}T00:00:00Z`).getTime();
    if (ts < cutoff) continue;
    const dir = path.join(TRACES_DIR, d);
    for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl"))) {
      // 过滤非 eval jsonl(hook 心跳 / backlog 事件)
      if (NON_EVAL_FILES.has(f)) continue;
      const content = fs.readFileSync(path.join(dir, f), "utf8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed);
          // 行级过滤:必须带 eval_id + result,否则跳过
          if (isEvalLine(parsed)) lines.push(parsed);
        } catch {
          // skip malformed
        }
      }
    }
  }
  return lines;
}

function countBacklogCandidates(): number {
  if (!fs.existsSync(BACKLOG_PATH)) return 0;
  const md = fs.readFileSync(BACKLOG_PATH, "utf8");
  const matches = md.match(/count:\s*(\d+)/g) ?? [];
  return matches.filter((m) => {
    const n = Number(m.replace(/count:\s*/, ""));
    return n >= 2;
  }).length;
}

interface PerEvalStat {
  eval_id: string;
  runs: number;
  pass: number;
  rate: number;
  avgDurationMs: number;
}

interface Summary {
  generatedAt: string;
  windowDays: number | "all";
  runs: number;
  pass: number;
  passAt1Rate: number;
  avgDurationMs: number;
  totalCostUsd: number;
  backlogCandidates: number;
  perEval: PerEvalStat[];
}

function summarize(lines: TraceLine[], days: number | "all"): Summary {
  const passLines = lines.filter((l) => l.result === "pass");
  const perEvalMap = new Map<string, TraceLine[]>();
  for (const l of lines) {
    if (!perEvalMap.has(l.eval_id)) perEvalMap.set(l.eval_id, []);
    perEvalMap.get(l.eval_id)!.push(l);
  }
  const perEval: PerEvalStat[] = [];
  for (const [id, xs] of perEvalMap.entries()) {
    const pass = xs.filter((l) => l.result === "pass").length;
    perEval.push({
      eval_id: id,
      runs: xs.length,
      pass,
      rate: xs.length === 0 ? 0 : pass / xs.length,
      avgDurationMs:
        xs.length === 0 ? 0 : Math.round(xs.reduce((acc, l) => acc + l.duration_ms, 0) / xs.length),
    });
  }
  perEval.sort((a, b) => a.eval_id.localeCompare(b.eval_id));

  return {
    generatedAt: new Date().toISOString(),
    windowDays: days,
    runs: lines.length,
    pass: passLines.length,
    passAt1Rate: lines.length === 0 ? 0 : passLines.length / lines.length,
    avgDurationMs:
      lines.length === 0
        ? 0
        : Math.round(lines.reduce((acc, l) => acc + l.duration_ms, 0) / lines.length),
    totalCostUsd: lines.reduce((acc, l) => acc + (l.cost_usd ?? 0), 0),
    backlogCandidates: countBacklogCandidates(),
    perEval,
  };
}

function renderMd(s: Summary): string {
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const window = s.windowDays === "all" ? "all" : `last ${s.windowDays}d`;
  const lines: string[] = [];
  lines.push(`# Harness Health`);
  lines.push("");
  lines.push(`> generated: ${s.generatedAt} · window: ${window}`);
  lines.push("");
  lines.push(`## Overview`);
  lines.push("");
  lines.push(`- Runs: **${s.runs}**`);
  lines.push(`- pass@1: **${pct(s.passAt1Rate)}** (${s.pass}/${s.runs})`);
  lines.push(`- Avg duration: **${s.avgDurationMs}ms**`);
  lines.push(`- Total cost: **$${s.totalCostUsd.toFixed(4)}** (live 模式才非零)`);
  lines.push(`- Backlog candidates (count ≥ 2): **${s.backlogCandidates}**`);
  lines.push("");
  if (s.perEval.length > 0) {
    lines.push(`## Per-eval`);
    lines.push("");
    lines.push("| eval_id | runs | pass | rate | avg ms |");
    lines.push("|---|---|---|---|---|");
    for (const e of s.perEval) {
      lines.push(`| ${e.eval_id} | ${e.runs} | ${e.pass} | ${pct(e.rate)} | ${e.avgDurationMs} |`);
    }
    lines.push("");
  }
  lines.push(`## Thresholds`);
  lines.push("");
  if (s.runs === 0) {
    lines.push(
      `- handoff §3 硬指标: pass@1 ≥ 70% — **⚪ 尚无 eval run(跑 \`pnpm eval\` 产生数据)**`,
    );
  } else {
    lines.push(
      `- handoff §3 硬指标: pass@1 ≥ 70% — **当前 ${pct(s.passAt1Rate)} ${s.passAt1Rate >= 0.7 ? "🟢" : "🔴"}**`,
    );
  }
  return lines.join("\n");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const lines = collectTraces(args.days);
  const summary = summarize(lines, args.days ?? "all");

  const output = args.json ? JSON.stringify(summary, null, 2) : renderMd(summary);

  if (args.out) {
    fs.writeFileSync(path.resolve(PROJECT_ROOT, args.out), output + "\n", "utf8");
    console.log(`wrote ${args.out}`);
  } else {
    console.log(output);
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
