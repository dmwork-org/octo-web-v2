#!/usr/bin/env node
/**
 * scripts/audit-upstream.ts — 扫描上游 octo-web 自 baseline 以来的变更
 *
 * 流程:
 *   1. 从 docs/sync-log.md 头部 "Upstream Baseline" 段读 baseline SHA
 *   2. 在 ~/.cache/octo-upstream 维护一份 bare clone(自动 fetch)
 *   3. git log baseline..FETCH_HEAD --name-only,按目录 bucket 分类输出 md
 *
 * 用法:
 *   pnpm scan:upstream                 # 输出到 stdout
 *   pnpm scan:upstream --out audit.md  # 写文件
 *
 * 落地动作仍由人决策:陈超挑选要搬的 SHA → AI 按 polish 同款流程实现 → MR 合并 →
 * 更新 sync-log.md 的 baseline SHA。
 *
 * 详见 plan: ~/.claude/plans/concurrent-sparking-bengio.md
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const PROJECT_ROOT = path.resolve(path.dirname(__filename), "..");
const SYNC_LOG = path.join(PROJECT_ROOT, "docs/sync-log.md");
const CACHE_DIR = path.join(os.homedir(), ".cache/octo-upstream");
const UPSTREAM_URL = "https://github.com/Mininglamp-OSS/octo-web.git";

interface Commit {
  sha: string;
  date: string;
  subject: string;
  files: string[];
}

/**
 * docs/sync-log.md 头部约定段落:
 *
 *   ## Upstream Baseline
 *   - upstream: https://github.com/Mininglamp-OSS/octo-web
 *   - baseline SHA: f32a1360
 *   - last audited: 2026-06-08
 *
 * 每次 batch 完更新 baseline SHA。这是唯一的真值源,本脚本读它。
 */
function parseBaseline(): string {
  const content = fs.readFileSync(SYNC_LOG, "utf-8");
  const match = content.match(/baseline SHA:\s*`?([a-f0-9]{7,40})`?/i);
  if (!match) {
    throw new Error(
      "baseline SHA 未找到。请在 docs/sync-log.md 头部加 '## Upstream Baseline' 段。",
    );
  }
  return match[1];
}

function ensureClone(): void {
  if (!fs.existsSync(CACHE_DIR)) {
    process.stderr.write(`[audit] cloning upstream → ${CACHE_DIR}\n`);
    fs.mkdirSync(path.dirname(CACHE_DIR), { recursive: true });
    execSync(`git clone --bare ${UPSTREAM_URL} "${CACHE_DIR}"`, { stdio: "inherit" });
  } else {
    process.stderr.write(`[audit] fetching upstream → ${CACHE_DIR}\n`);
    // bare repo:`+main:main` 强制更新 main ref(普通 fetch 只更新 FETCH_HEAD)
    execSync(`git --git-dir="${CACHE_DIR}" fetch origin "+main:main"`, { stdio: "inherit" });
  }
}

function git(args: string): string {
  return execSync(`git --git-dir="${CACHE_DIR}" ${args}`, { encoding: "utf-8" });
}

/**
 * 解析 git log --name-only 输出。用 `--` 作 commit 分隔(不太可能出现在 subject 里)。
 *
 * 每个 commit 的 record 结构:
 *   --
 *   <sha>\t<date>\t<subject>
 *   file1
 *   file2
 *   ...
 */
function parseLog(baseline: string): Commit[] {
  const out = git(
    `log ${baseline}..main --name-only --pretty=format:"%n--%n%h%x09%ad%x09%s" --date=short`,
  );
  const commits: Commit[] = [];
  let current: Commit | null = null;
  let inHeader = false;
  for (const raw of out.split("\n")) {
    const line = raw.trim();
    if (line === "--") {
      if (current) commits.push(current);
      current = null;
      inHeader = true;
      continue;
    }
    if (!line) continue;
    if (inHeader) {
      const [sha, date, ...rest] = line.split("\t");
      if (sha && date) {
        current = { sha, date, subject: rest.join("\t"), files: [] };
      }
      inHeader = false;
    } else if (current) {
      current.files.push(line);
    }
  }
  if (current) commits.push(current);
  return commits;
}

/** 按上仓 monorepo 目录分类(按业务领域,跟新仓 features/* 对齐) */
const BUCKETS: { label: string; prefix: string }[] = [
  { label: "业务 UI (Components)", prefix: "packages/dmworkbase/src/Components/" },
  { label: "Message renderers", prefix: "packages/dmworkbase/src/Messages/" },
  { label: "Service / API / Model", prefix: "packages/dmworkbase/src/Service/" },
  { label: "Pages / Views", prefix: "packages/dmworkbase/src/Pages/" },
  { label: "Matter / Todo", prefix: "packages/dmworktodo/" },
  { label: "Summary", prefix: "packages/dmworksummary/" },
  { label: "Persona / OBO", prefix: "packages/dmworkpersona/" },
  { label: "Contacts", prefix: "packages/dmworkcontacts/" },
  { label: "AppBot", prefix: "packages/dmworkappbot/" },
  { label: "Login", prefix: "packages/dmworklogin/" },
];

function classify(files: string[]): string[] {
  const hits = new Set<string>();
  for (const f of files) {
    for (const b of BUCKETS) {
      if (f.startsWith(b.prefix)) hits.add(b.label);
    }
  }
  if (hits.size === 0) hits.add("其他");
  return [...hits];
}

function summarizeFiles(files: string[]): string {
  if (files.length === 0) return "(no files)";
  if (files.length <= 3) return files.join(", ");
  return `${files.slice(0, 3).join(", ")} +${files.length - 3}`;
}

function build(commits: Commit[], baseline: string, head: string): string {
  let md = `# 上游变更扫描

- upstream: \`${UPSTREAM_URL}\`
- baseline: \`${baseline}\`
- HEAD: \`${head}\`
- total: ${commits.length} commits

`;
  if (commits.length === 0) {
    md += "✅ 已对齐到上游 HEAD,无未搬变更。\n";
    return md;
  }
  // 按第一个 bucket 分组(一个 commit 涉及多 bucket 时,在每个 bucket 各列一次)
  const groups = new Map<string, Commit[]>();
  for (const c of commits) {
    for (const label of classify(c.files)) {
      const arr = groups.get(label) ?? [];
      arr.push(c);
      groups.set(label, arr);
    }
  }
  // 按 BUCKETS 顺序输出,"其他"在最后
  const ordered = [...BUCKETS.map((b) => b.label), "其他"].filter((l) => groups.has(l));
  for (const label of ordered) {
    const arr = groups.get(label)!;
    md += `## ${label} (${arr.length} commits)\n\n`;
    for (const c of arr) {
      md += `- \`${c.sha}\` ${c.date} ${c.subject}\n  - ${summarizeFiles(c.files)}\n`;
    }
    md += "\n";
  }
  return md;
}

function parseArgs(): { out?: string } {
  const args = process.argv.slice(2);
  const out: { out?: string } = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--out" && args[i + 1]) {
      out.out = args[++i];
    }
  }
  return out;
}

function main(): void {
  const { out } = parseArgs();
  const baseline = parseBaseline();
  ensureClone();
  const commits = parseLog(baseline);
  const head = git("rev-parse --short main").trim();
  const md = build(commits, baseline, head);
  if (out) {
    fs.writeFileSync(out, md);
    process.stderr.write(`[audit] wrote ${out}\n`);
  } else {
    process.stdout.write(md);
  }
}

main();
