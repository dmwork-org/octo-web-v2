/**
 * eval framework 类型定义
 *
 * 单个 eval case = 一对文件:
 *   PROMPT.md — 给 CC 的任务（自然语言）
 *   EVAL.ts   — 对 CC 产出的机器断言（default export 一个 EvalCase）
 *
 * runner 读取 evals 目录，对每个 case 跑 N 次，统计 pass@1 / pass@N。
 */

// ==================== Assertion 种类 ====================

/** 检查某条 taste rule 的判定结果 */
export interface TasteRuleAssertion {
  kind: "taste-rule";
  rule: string; // rule id from .ai/taste/rules.ts
  expect: "pass" | "fail";
}

/** AST 层存在某个模式 */
export interface AstContainsAssertion {
  kind: "ast-contains";
  pattern: string; // 简化 AST pattern DSL（Week 3-4 定）
  expect: boolean;
}

/** AST 层不存在某个模式 */
export interface AstAbsentAssertion {
  kind: "ast-absent";
  pattern: string;
  expect: boolean;
}

/** `vp check --fix` 是否通过 */
export interface VpCheckAssertion {
  kind: "vp-check";
  expect: "pass" | "fail";
}

/** 输出文件内容匹配某 regex（golden-ish） */
export interface OutputMatchesAssertion {
  kind: "output-matches";
  file: string; // 相对 eval 目录
  pattern: RegExp;
  expect: boolean;
}

/** 自定义断言函数（逃生口） */
export interface CustomAssertion {
  kind: "custom";
  name: string;
  check: (ctx: EvalContext) => Promise<boolean> | boolean;
}

export type Assertion =
  | TasteRuleAssertion
  | AstContainsAssertion
  | AstAbsentAssertion
  | VpCheckAssertion
  | OutputMatchesAssertion
  | CustomAssertion;

// ==================== Eval case ====================

export interface EvalCase {
  /** 和所在目录名一致 */
  id: string;
  /** 一句话说明这个 eval 在验证什么品味 */
  intent?: string;
  /**
   * CC 产出目标文件的相对路径(项目根)。
   * - Step 4 MVP: 运行器 assert 该路径对应的 `_golden-output.tsx`(eval 目录内)
   * - Step 5 live: CC 真实写到 targetFile
   * 若未填,assertion 若依赖目标文件会 fail 并报 "missing targetFile"
   */
  targetFile?: string;
  assertions: Assertion[];
  /** 默认 5,可按 case 调整 */
  repeatN?: number;
  /** 超时 ms,默认 60_000 */
  timeoutMs?: number;
}

// ==================== Runner ====================

export interface EvalContext {
  /** 本次运行生成的所有文件（相对 eval 目录的路径 → 内容）*/
  outputs: Map<string, string>;
  /** CC 运行的 trace event（handoff §7.5）*/
  trace: TraceEvent[];
  /** prompt 原文 */
  prompt: string;
}

/** handoff §7.5 的 TraceEvent schema */
export interface TraceEvent {
  timestamp: number;
  task_id: string;
  role: string;
  stage: string;
  input_hash: string;
  output_hash: string;
  tokens: { in: number; out: number };
  cost_usd: number;
  duration_ms: number;
  parent_span: string | null;
}

export interface AssertionResult {
  assertion: Assertion;
  passed: boolean;
  details?: string;
}

export interface RunResult {
  caseId: string;
  /** 第几次重复（0-indexed，0..repeatN-1） */
  attempt: number;
  assertions: AssertionResult[];
  allPassed: boolean;
  durationMs: number;
}

export interface EvalReport {
  totalCases: number;
  passAt1: number; // 每个 case 第一次就全通过的占比
  passAtN: number; // 每个 case N 次里至少一次全通过的占比
  cases: Array<{
    caseId: string;
    runs: RunResult[];
    passAt1: boolean;
    passAtN: boolean;
  }>;
}
