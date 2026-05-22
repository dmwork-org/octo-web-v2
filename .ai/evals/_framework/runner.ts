/**
 * eval runner 骨架
 *
 * Week 0：只定义函数签名和主流程。所有执行逻辑 TODO 到 Week 3-4。
 * Week 3-4：
 *   - discoverEvals: glob `.ai/evals/<id>/EVAL.ts` + `PROMPT.md`
 *   - runOnce: 调 CC（subprocess 或 SDK）跑 PROMPT，收集 outputs + trace
 *   - evaluateAssertions: 逐条断言判定
 *   - writeReport: 输出 JSON + console summary + trace 落盘到 .ai/traces/{date}/
 */

import type { EvalCase, EvalReport, RunResult, AssertionResult, EvalContext } from "./types";

export interface RunnerOptions {
  /** .ai/evals 根目录 */
  evalsDir: string;
  /** 要跑的 case id 列表，空数组表示全跑 */
  caseIds?: string[];
  /** 全局 override repeatN */
  repeatN?: number;
  /** trace 落盘目录，默认 .ai/traces/{today}/ */
  traceDir?: string;
}

// ==================== 主入口 ====================

export async function runEvals(_opts: RunnerOptions): Promise<EvalReport> {
  // TODO(week-3-4): 实现
  // 1. const cases = await discoverEvals(opts.evalsDir, opts.caseIds)
  // 2. for each case: run N times via runOnce()
  // 3. aggregate to EvalReport
  // 4. writeReport(report, opts.traceDir)
  throw new Error("runEvals: not implemented (Week 3-4)");
}

// ==================== 内部步骤（骨架） ====================

/** 扫描 evalsDir，加载每个 case 的 PROMPT.md + EVAL.ts */
async function discoverEvals(
  _evalsDir: string,
  _caseIds?: string[],
): Promise<Array<{ case_: EvalCase; promptPath: string }>> {
  // TODO(week-3-4)
  return [];
}

/** 跑一个 case 一次，返回 output 集 + trace */
async function runOnce(
  _case_: EvalCase,
  _promptPath: string,
  _attempt: number,
): Promise<{ ctx: EvalContext; durationMs: number }> {
  // TODO(week-3-4):
  // 1. 读 PROMPT.md
  // 2. 调 CC subprocess（Phase 1 用 Claude Code CLI；Phase 2 用 SDK 直接调 model）
  // 3. 收集产出文件到 ctx.outputs
  // 4. 收集 trace event 到 ctx.trace
  throw new Error("runOnce: not implemented");
}

/** 对一次运行的结果跑所有断言 */
async function evaluateAssertions(case_: EvalCase, ctx: EvalContext): Promise<AssertionResult[]> {
  const results: AssertionResult[] = [];

  for (const assertion of case_.assertions) {
    // TODO(week-3-4): 按 assertion.kind 分发
    switch (assertion.kind) {
      case "taste-rule":
      case "ast-contains":
      case "ast-absent":
      case "vp-check":
      case "output-matches":
      case "custom":
      default:
        results.push({
          assertion,
          passed: false,
          details: `not implemented: ${assertion.kind}`,
        });
    }
  }

  return results;
}

/** 把 EvalReport 落盘 + trace 落到 .ai/traces/{date}/ */
async function writeReport(_report: EvalReport, _traceDir: string): Promise<void> {
  // TODO(week-3-4): JSON dump + console table + trace JSONL
}

// ==================== 汇总工具 ====================

export function summarize(runs: RunResult[]): {
  passAt1: boolean;
  passAtN: boolean;
} {
  if (runs.length === 0) return { passAt1: false, passAtN: false };
  const first = runs[0];
  return {
    passAt1: first.allPassed,
    passAtN: runs.some((r) => r.allPassed),
  };
}
