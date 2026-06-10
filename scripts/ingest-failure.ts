#!/usr/bin/env node
/**
 * scripts/ingest-failure.ts — Karpathy Ingest(backlog → 草稿规则/eval)
 *
 * 读 .ai/evals/backlog.md 的 ## Active section,找 count >= 2 的 bullet,
 * 按「动作」字段决定产出:
 *   - "new-rule" / "需要新规则"     → `.claude/rules/draft-<date>-<slug>.md`(规则草稿)
 *   - "promote-to-eval" / "promote" → `.ai/evals/draft-<date>-<slug>/`(eval 目录草稿)
 *   - 其他                          → 跳过(observe / discard)
 *
 * 阈值:count ≥ 2(CLAUDE.md 哲学 8 "先跑 n=1 再抽象")。
 *
 * 用法:
 *   pnpm run ingest-failure                # dry-run,只打印候选,不落盘
 *   pnpm run ingest-failure --apply        # 落盘草稿文件
 *   pnpm run ingest-failure --json         # JSON 输出(供 CI / hook 消费)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const PROJECT_ROOT = path.resolve(path.dirname(__filename), "..");
const BACKLOG_PATH = path.join(PROJECT_ROOT, ".ai/evals/backlog.md");
const RULES_DRAFT_DIR = path.join(PROJECT_ROOT, ".claude/rules");
const EVALS_DRAFT_BASE = path.join(PROJECT_ROOT, ".ai/evals");

const COUNT_THRESHOLD = 2;

interface BacklogEntry {
  date: string;
  count: number;
  现象: string;
  触发上下文: string;
  暂判: string;
  动作: string;
  raw: string;
}

type Action = "new-rule" | "promote-to-eval" | "skip";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/**
 * 解析 backlog.md。只抓 `## Active` 到下一个 `##` 之间的 bullets。
 * 每个一级 bullet 含 "count: N",下面嵌套 4 个字段。
 */
function parseBacklog(md: string): BacklogEntry[] {
  const entries: BacklogEntry[] = [];
  const activeStart = md.indexOf("## Active");
  if (activeStart === -1) return entries;
  const afterActive = md.slice(activeStart);
  const nextSectionIdx = afterActive.search(/\n## (?!Active)/);
  const activeBlock = nextSectionIdx === -1 ? afterActive : afterActive.slice(0, nextSectionIdx);

  // 把 block 按一级 bullet `- **YYYY-MM-DD**` 切分
  const bulletRegex = /\n- \*\*(\d{4}-\d{2}-\d{2})\*\*[^\n]*count:\s*(\d+)/g;
  const starts: Array<{ idx: number; date: string; count: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = bulletRegex.exec(activeBlock))) {
    starts.push({ idx: m.index, date: m[1]!, count: Number(m[2]) });
  }
  for (let i = 0; i < starts.length; i++) {
    const start = starts[i]!.idx;
    const end = i + 1 < starts.length ? starts[i + 1]!.idx : activeBlock.length;
    const raw = activeBlock.slice(start, end);
    const entry: BacklogEntry = {
      date: starts[i]!.date,
      count: starts[i]!.count,
      现象: extractField(raw, "现象"),
      触发上下文: extractField(raw, "触发上下文"),
      暂判: extractField(raw, "暂判"),
      动作: extractField(raw, "动作"),
      raw,
    };
    entries.push(entry);
  }
  return entries;
}

function extractField(block: string, name: string): string {
  const re = new RegExp(`\\*\\*${name}\\*\\*\\s*[::]?\\s*([^\\n]+)`);
  const m = re.exec(block);
  return m ? m[1]!.trim() : "";
}

function classifyAction(entry: BacklogEntry): Action {
  const act = entry.动作.toLowerCase();
  if (act.includes("new-rule") || act.includes("新规则")) return "new-rule";
  if (act.includes("promote-to-eval") || act.includes("promote")) return "promote-to-eval";
  return "skip";
}

function renderRuleDraft(entry: BacklogEntry): string {
  return `---
paths:
  - "src/**/*.ts"
  - "src/**/*.tsx"
---

# (draft) 规则 — ${entry.现象}

> ⚠️ **自动生成草稿**(ingest-failure.ts · ${entry.date} · count=${entry.count})。
> 项目负责人需要:
> 1. 写正/反例
> 2. 填例外
> 3. 迁移到 .ai/taste/rules.md 对应 section + rules.ts 注册
> 4. 加 originFailure 字段(PR / trace 链)
> 5. 删本文件

## Why

${entry.现象}

## 触发上下文

${entry.触发上下文}

## 暂判

${entry.暂判}

## 反例

TODO

## 正例

TODO

## 例外

TODO(无 → 写"无")

## 机器检

TODO(选 oxlint-builtin / oxlint-plugin / ts-morph / workflow)
`;
}

function renderEvalDraftPrompt(entry: BacklogEntry): string {
  return `# (draft) eval

> ⚠️ **自动生成草稿**(ingest-failure.ts · ${entry.date} · count=${entry.count})

## Intent

${entry.现象}

## Setup

TODO

## Task

TODO(补真实任务 prompt)

## Expected tanstack_refs

TODO
`;
}

function renderEvalDraftEval(entry: BacklogEntry, slug: string): string {
  return `import type { EvalCase } from '../_framework/types';

const c: EvalCase = {
  id: 'draft-${entry.date}-${slug}',
  intent: ${JSON.stringify(entry.现象)},
  assertions: [
    // TODO(maintainer): 填断言
  ],
};

export default c;
`;
}

// ==================== main ====================

interface CliArgs {
  apply: boolean;
  json: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { apply: false, json: false };
  for (const a of argv) {
    if (a === "--apply") args.apply = true;
    else if (a === "--json") args.json = true;
    else if (a.startsWith("--")) throw new Error(`unknown flag: ${a}`);
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(BACKLOG_PATH)) {
    console.error(`缺失 ${BACKLOG_PATH}`);
    process.exit(1);
  }
  const md = fs.readFileSync(BACKLOG_PATH, "utf8");
  const entries = parseBacklog(md);
  const candidates = entries.filter((e) => e.count >= COUNT_THRESHOLD);

  interface Output {
    total: number;
    overThreshold: number;
    actions: Array<{ entry: BacklogEntry; action: Action; wrote?: string }>;
  }
  const out: Output = { total: entries.length, overThreshold: candidates.length, actions: [] };

  for (const entry of candidates) {
    const action = classifyAction(entry);
    const slug = slugify(entry.现象 || "unknown");
    let wrote: string | undefined;

    if (action === "new-rule") {
      const dest = path.join(RULES_DRAFT_DIR, `draft-${entry.date}-${slug}.md`);
      if (args.apply) {
        fs.mkdirSync(RULES_DRAFT_DIR, { recursive: true });
        fs.writeFileSync(dest, renderRuleDraft(entry));
      }
      wrote = path.relative(PROJECT_ROOT, dest);
    } else if (action === "promote-to-eval") {
      const dir = path.join(EVALS_DRAFT_BASE, `draft-${entry.date}-${slug}`);
      if (args.apply) {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, "PROMPT.md"), renderEvalDraftPrompt(entry));
        fs.writeFileSync(path.join(dir, "EVAL.ts"), renderEvalDraftEval(entry, slug));
      }
      wrote = path.relative(PROJECT_ROOT, dir);
    }

    out.actions.push({ entry, action, wrote });
  }

  if (args.json) {
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  console.log(`backlog 条目: ${out.total};≥ ${COUNT_THRESHOLD} 次的候选: ${out.overThreshold}`);
  if (out.overThreshold === 0) {
    console.log("🟢 无晋升候选");
    return;
  }
  for (const a of out.actions) {
    const mark = a.action === "skip" ? "⏭️ " : "📝";
    console.log(
      `${mark} [${a.action}] ${a.entry.date} count=${a.entry.count} 现象="${a.entry.现象}"`,
    );
    if (a.wrote) {
      console.log(`    ${args.apply ? "→ 已写" : "(dry-run,加 --apply 落盘)"}: ${a.wrote}`);
    }
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
