#!/usr/bin/env node
/**
 * scripts/run-evals.ts — eval 运行入口
 *
 * 用法:
 *   pnpm run eval <eval-id>           单跑一个 eval
 *   pnpm run eval                     全跑(Step 5 接入 claude -p 后再放开)
 *
 * Step 4 MVP:
 *   - 不调 claude -p;只对 eval 目录的 `_golden-output.tsx` 跑断言
 *   - 断言 kind 支持:taste-rule / vp-check
 *   - 其他 kind(ast-contains / ast-absent / output-matches / custom)→ 'not implemented'
 *   - trace 写 `.ai/traces/<date>/run-evals.jsonl`,OTel 字段齐(B15)
 *
 * Step 5:
 *   - --live 开关走 claude -p:spawn CC 按 PROMPT.md 写 targetFile,再对同一 target 跑断言
 *   - cost_usd / token_in / token_out 从 claude -p --output-format=json 的 usage 字段抽
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Assertion, EvalCase } from "../.ai/evals/_framework/types";

const __filename = fileURLToPath(import.meta.url);
const PROJECT_ROOT = path.resolve(path.dirname(__filename), "..");
const EVALS_DIR = path.join(PROJECT_ROOT, ".ai/evals");

interface AssertionResult {
  kind: string;
  passed: boolean;
  details: string;
}

interface TraceLine {
  ts: string;
  session: string;
  tool: "run-evals";
  eval_id: string;
  attempt: number;
  result: "pass" | "fail";
  duration_ms: number;
  cost_usd: number;
  token_in: number;
  token_out: number;
  vp_check: "pass" | "fail" | "skipped";
  taste_lint: "pass" | "fail" | "skipped";
  assertions: AssertionResult[];
  mode: "mvp" | "live";
}

interface EvalTarget {
  goldenAbs: string;
  cleanup: () => void;
}

interface CliArgs {
  evalIds: string[];
  live: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { evalIds: [], live: false };
  for (const a of argv) {
    if (a === "--live") args.live = true;
    else if (a.startsWith("--")) throw new Error(`unknown flag: ${a}`);
    else args.evalIds.push(a);
  }
  return args;
}

function listActiveEvalIds(): string[] {
  return fs
    .readdirSync(EVALS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
    .filter((entry) => fs.existsSync(path.join(EVALS_DIR, entry.name, "EVAL.ts")))
    .map((entry) => entry.name)
    .sort();
}

// ==================== 断言执行 ====================

function runVpCheck(targetAbs: string): { passed: boolean; output: string } {
  const res = spawnSync("vp", ["check", "--no-fmt", targetAbs], {
    encoding: "utf8",
    cwd: PROJECT_ROOT,
  });
  const output = `${res.stdout ?? ""}${res.stderr ?? ""}`;
  return { passed: res.status === 0, output };
}

function runAssertion(a: Assertion, goldenAbs: string): AssertionResult {
  switch (a.kind) {
    case "taste-rule": {
      const { passed: vpPassed, output } = runVpCheck(goldenAbs);
      const ruleFired = output.includes(`taste(${a.rule})`) || output.includes(a.rule);
      const passed = a.expect === "pass" ? !ruleFired : ruleFired;
      return {
        kind: a.kind,
        passed,
        details: `rule=${a.rule} expect=${a.expect} vpPassed=${vpPassed} ruleFired=${ruleFired}`,
      };
    }
    case "vp-check": {
      const { passed: vpPassed } = runVpCheck(goldenAbs);
      const passed = a.expect === "pass" ? vpPassed : !vpPassed;
      return { kind: a.kind, passed, details: `expect=${a.expect} vpPassed=${vpPassed}` };
    }
    case "ast-contains":
    case "ast-absent":
    case "output-matches":
    case "custom":
      return { kind: a.kind, passed: false, details: "not implemented (Step 5)" };
  }
}

function prepareMvpTarget(evalId: string, evalDir: string): EvalTarget {
  const golden = path.join(evalDir, "_golden-output.tsx");
  if (!fs.existsSync(golden)) {
    throw new Error(`missing ${golden}(Step 4 MVP 需要 _golden-output.tsx)`);
  }

  const tempDir = path.join(PROJECT_ROOT, "src/__evals__", `${evalId}-${process.pid}`);
  fs.rmSync(tempDir, { recursive: true, force: true });
  fs.mkdirSync(tempDir, { recursive: true });
  for (const entry of fs.readdirSync(evalDir)) {
    if (entry.endsWith(".tsx")) {
      fs.copyFileSync(path.join(evalDir, entry), path.join(tempDir, entry));
    }
  }
  return {
    goldenAbs: path.join(tempDir, "_golden-output.tsx"),
    cleanup: () => fs.rmSync(tempDir, { recursive: true, force: true }),
  };
}

// ==================== 单 eval 跑一遍 ====================

async function runOne(evalId: string, live: boolean): Promise<TraceLine> {
  const evalDir = path.join(EVALS_DIR, evalId);
  if (!fs.existsSync(evalDir)) throw new Error(`eval not found: ${evalId}`);

  const evalModulePath = path.join(evalDir, "EVAL.ts");
  const mod = await import(evalModulePath);
  const c: EvalCase = mod.default;

  if (live) {
    throw new Error("--live 未实现(Step 5 接 claude -p)");
  }

  const startTime = Date.now();
  let assertionResults: AssertionResult[];
  let durationMs: number;
  const target = prepareMvpTarget(evalId, evalDir);
  try {
    assertionResults = c.assertions.map((a) => runAssertion(a, target.goldenAbs));
    durationMs = Date.now() - startTime;
  } finally {
    target.cleanup();
  }

  const sessionId = `eval-${evalId}-${startTime}`;
  const allPassed = assertionResults.every((r) => r.passed);
  const vpCheckAssertion = assertionResults.find((r) => r.kind === "vp-check");
  const tasteRuleAssertions = assertionResults.filter((r) => r.kind === "taste-rule");

  return {
    ts: new Date().toISOString(),
    session: sessionId,
    tool: "run-evals",
    eval_id: evalId,
    attempt: 0,
    result: allPassed ? "pass" : "fail",
    duration_ms: durationMs,
    cost_usd: 0,
    token_in: 0,
    token_out: 0,
    vp_check: vpCheckAssertion ? (vpCheckAssertion.passed ? "pass" : "fail") : "skipped",
    taste_lint:
      tasteRuleAssertions.length === 0
        ? "skipped"
        : tasteRuleAssertions.every((r) => r.passed)
          ? "pass"
          : "fail",
    assertions: assertionResults,
    mode: live ? "live" : "mvp",
  };
}

// ==================== trace 落盘 ====================

function writeTrace(line: TraceLine): string {
  const date = line.ts.slice(0, 10);
  const dir = path.join(PROJECT_ROOT, ".ai/traces", date);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "run-evals.jsonl");
  fs.appendFileSync(file, `${JSON.stringify(line)}\n`, "utf8");
  return file;
}

// ==================== main ====================

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const evalIds = args.evalIds.length > 0 ? args.evalIds : listActiveEvalIds();
  if (evalIds.length === 0) throw new Error("no active evals found");

  let failed = 0;
  for (const id of evalIds) {
    const line = await runOne(id, args.live);
    const tracePath = writeTrace(line);
    console.log(
      `${line.result === "pass" ? "🟢" : "🔴"} ${id} · ${line.duration_ms}ms · vp=${line.vp_check} · taste=${line.taste_lint} · trace=${path.relative(PROJECT_ROOT, tracePath)}`,
    );
    for (const a of line.assertions) {
      console.log(`  ${a.passed ? "✓" : "✗"} ${a.kind} — ${a.details}`);
    }
    if (line.result === "fail") failed++;
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
