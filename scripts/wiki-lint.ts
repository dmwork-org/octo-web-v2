#!/usr/bin/env node
/**
 * scripts/wiki-lint.ts — Wiki 三角一致性(Karpathy Lint,CLAUDE.md 哲学 9)
 *
 * 检查:
 *   1. Orphan rule: rules.ts 里有但 eval 没覆盖 → error
 *   2. Orphan eval: eval 里引用了 rules.ts 不存在的 rule id → error
 *   3. Skill 语义互斥(CLAUDE.md 哲学 10): 两 skill 的 description jaccard ≥ 0.4
 *      或 paths regex 有交集 → warn(触发冲突风险)
 *   4. (TODO Step 5+) Skill example 三角: rule 至少被某 skill 示范演示
 *
 * 用法:
 *   pnpm run wiki-lint         # 检查
 *   pnpm run wiki-lint --json  # JSON 输出,供 hook / CI 消费
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { EvalCase } from "../.ai/evals/_framework/types";
import { rules } from "../.ai/taste/rules";

const __filename = fileURLToPath(import.meta.url);
const PROJECT_ROOT = path.resolve(path.dirname(__filename), "..");
const EVALS_DIR = path.join(PROJECT_ROOT, ".ai/evals");
const SKILLS_DIR = path.join(PROJECT_ROOT, ".claude/skills");

type Severity = "error" | "warn";
type IssueKind =
  | "orphan-rule"
  | "orphan-eval"
  | "eval-load-failed"
  | "skill-description-overlap"
  | "skill-paths-overlap"
  | "skill-load-failed";

interface Issue {
  severity: Severity;
  kind: IssueKind;
  message: string;
}

interface SkillMeta {
  id: string;
  name: string;
  description: string;
  paths: string[];
}

async function loadEvalCase(evalDir: string): Promise<EvalCase | null> {
  const evalTs = path.join(evalDir, "EVAL.ts");
  if (!fs.existsSync(evalTs)) return null;
  const mod = await import(evalTs);
  const c = mod.default as EvalCase;
  if (!c || !c.id || !Array.isArray(c.assertions)) return null;
  return c;
}

// 最小 YAML frontmatter 解析器 — 只要 name / description / paths 三字段
function parseSkillFrontmatter(raw: string, skillId: string): SkillMeta | null {
  const m = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const body = m[1] ?? "";
  const name = /^name:\s*(.+)$/m.exec(body)?.[1]?.trim() ?? skillId;
  const desc = /^description:\s*(.+)$/m.exec(body)?.[1]?.trim() ?? "";
  // paths 支持 inline array `paths: [a, b]` 或 YAML list `paths:\n  - a\n  - b`
  const pathsInline = /^paths:\s*\[(.*?)\]/m.exec(body);
  const pathsList: string[] = [];
  if (pathsInline) {
    pathsInline[1]!.split(",").forEach((s) => {
      const t = s.trim().replace(/^["']|["']$/g, "");
      if (t) pathsList.push(t);
    });
  } else {
    const pathsBlock = /^paths:\s*\n((?:\s+-\s+.+\n?)+)/m.exec(body);
    if (pathsBlock) {
      pathsBlock[1]!.split("\n").forEach((line) => {
        const t = line
          .replace(/^\s*-\s*/, "")
          .trim()
          .replace(/^["']|["']$/g, "");
        if (t) pathsList.push(t);
      });
    }
  }
  return { id: skillId, name, description: desc, paths: pathsList };
}

function loadAllSkills(issues: Issue[]): SkillMeta[] {
  if (!fs.existsSync(SKILLS_DIR)) return [];
  const out: SkillMeta[] = [];
  for (const d of fs.readdirSync(SKILLS_DIR, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const skillMd = path.join(SKILLS_DIR, d.name, "SKILL.md");
    if (!fs.existsSync(skillMd)) continue;
    try {
      const raw = fs.readFileSync(skillMd, "utf8");
      const meta = parseSkillFrontmatter(raw, d.name);
      if (!meta) {
        issues.push({
          severity: "warn",
          kind: "skill-load-failed",
          message: `${d.name}: SKILL.md 无 YAML frontmatter`,
        });
        continue;
      }
      out.push(meta);
    } catch (err) {
      issues.push({
        severity: "warn",
        kind: "skill-load-failed",
        message: `${d.name}: ${(err as Error).message}`,
      });
    }
  }
  return out;
}

// description 做简单 token 化,停用词去掉,算 Jaccard
const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "to",
  "of",
  "in",
  "on",
  "for",
  "with",
  "use",
  "when",
  "that",
  "this",
  "is",
  "are",
  "be",
  "it",
  "as",
  "at",
  "by",
  "from",
  "into",
  "via",
  "under",
  "over",
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]+/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 3 && !STOP_WORDS.has(t)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

// paths 最简相交:任一字符串 startsWith 另一条 → 视为冲突
function pathsOverlap(a: string[], b: string[]): boolean {
  for (const x of a) {
    for (const y of b) {
      if (x === y) return true;
      // 去掉 glob 尾巴 `**` 再比 prefix
      const xp = x.replace(/\*+$/, "");
      const yp = y.replace(/\*+$/, "");
      if (xp && (yp.startsWith(xp) || xp.startsWith(yp))) return true;
    }
  }
  return false;
}

function checkSkillMutex(skills: SkillMeta[], issues: Issue[]): void {
  const DESC_THRESHOLD = 0.4;
  for (let i = 0; i < skills.length; i++) {
    for (let j = i + 1; j < skills.length; j++) {
      const sa = skills[i]!;
      const sb = skills[j]!;
      const sim = jaccard(tokenize(sa.description), tokenize(sb.description));
      if (sim >= DESC_THRESHOLD) {
        issues.push({
          severity: "warn",
          kind: "skill-description-overlap",
          message: `"${sa.id}" × "${sb.id}" description jaccard=${sim.toFixed(2)} ≥ ${DESC_THRESHOLD}`,
        });
      }
      if (pathsOverlap(sa.paths, sb.paths)) {
        issues.push({
          severity: "warn",
          kind: "skill-paths-overlap",
          message: `"${sa.id}" × "${sb.id}" paths 相交: [${sa.paths.join(",")}] ∩ [${sb.paths.join(",")}]`,
        });
      }
    }
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const jsonOut = args.includes("--json");
  const issues: Issue[] = [];

  const knownRuleIds = new Set(Object.keys(rules));
  const ruleToEvals = new Map<string, string[]>();

  const evalDirs = fs
    .readdirSync(EVALS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("_"))
    .map((d) => d.name)
    .sort();

  for (const evalId of evalDirs) {
    let c: EvalCase | null;
    try {
      c = await loadEvalCase(path.join(EVALS_DIR, evalId));
    } catch (err) {
      issues.push({
        severity: "error",
        kind: "eval-load-failed",
        message: `${evalId}: ${(err as Error).message}`,
      });
      continue;
    }
    if (!c) continue;

    for (const a of c.assertions) {
      if (a.kind !== "taste-rule") continue;
      if (!knownRuleIds.has(a.rule)) {
        issues.push({
          severity: "error",
          kind: "orphan-eval",
          message: `eval "${evalId}" 引用未知 rule "${a.rule}"`,
        });
        continue;
      }
      if (!ruleToEvals.has(a.rule)) ruleToEvals.set(a.rule, []);
      ruleToEvals.get(a.rule)!.push(evalId);
    }
  }

  for (const ruleId of knownRuleIds) {
    if (!ruleToEvals.has(ruleId)) {
      issues.push({
        severity: "error",
        kind: "orphan-rule",
        message: `rule "${ruleId}" 无 eval 覆盖`,
      });
    }
  }

  const skills = loadAllSkills(issues);
  checkSkillMutex(skills, issues);

  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warnCount = issues.filter((i) => i.severity === "warn").length;

  if (jsonOut) {
    console.log(
      JSON.stringify(
        {
          totalRules: knownRuleIds.size,
          rulesCovered: ruleToEvals.size,
          totalEvals: evalDirs.length,
          totalSkills: skills.length,
          issues,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(`Wiki 三角校验`);
    console.log(`  rules(总): ${knownRuleIds.size}`);
    console.log(`  rules(有 eval): ${ruleToEvals.size}`);
    console.log(`  evals: ${evalDirs.length}`);
    console.log(`  skills: ${skills.length}`);
    if (issues.length === 0) {
      console.log(`🟢 三角闭合,无孤儿,skill 互斥`);
    } else {
      for (const i of issues) {
        const mark = i.severity === "error" ? "🔴" : "🟡";
        console.log(`${mark} [${i.kind}] ${i.message}`);
      }
      console.log(`\n共 ${errorCount} error / ${warnCount} warn`);
    }
  }

  process.exit(errorCount > 0 ? 1 : 0);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
