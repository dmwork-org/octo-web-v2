/**
 * 示例 eval assertions（**不是真实 case**）
 *
 * 展示如何把 PROMPT.md 的任务翻译成机器可判的断言集。真实 eval 会从 pilot
 * 项目真实场景出发写，并在 Week 3-4 随 `_framework/runner.ts` 实现一起跑通。
 *
 * 真实 eval 验收标准（Week 3-4）：
 *   1. 所有 `taste-rule` 断言里的 rule id 必须在 `.ai/taste/rules.ts` 存在
 *   2. `ast-contains` / `ast-absent` 的 pattern DSL 由 `_framework/runner.ts` 定义
 *   3. `repeatN` 默认 5（pass@N 统计 N 次里至少一次全过）
 */

import type { EvalCase } from "../_framework/types";

const example: EvalCase = {
  id: "_example-list-with-loader",
  intent: "列表路由正确使用 loader，不 useEffect+fetch，配 errorComponent，显式 staleTime",
  assertions: [
    // taste rule 层面
    { kind: "taste-rule", rule: "no-useeffect-fetch", expect: "pass" },
    { kind: "taste-rule", rule: "use-filebased-route", expect: "pass" },
    { kind: "taste-rule", rule: "route-error-component-required", expect: "pass" },
    { kind: "taste-rule", rule: "explicit-staletime", expect: "pass" },

    // AST 层面（冗余检查，抓住 LLM"嘴上答应但手写歪"的情况）
    { kind: "ast-contains", pattern: "loader:", expect: true },
    { kind: "ast-contains", pattern: "errorComponent:", expect: true },
    { kind: "ast-absent", pattern: "useEffect(", expect: true },
    { kind: "ast-absent", pattern: "fetch(", expect: true }, // 应走 ofetch

    // Vite+ 闸
    { kind: "vp-check", expect: "pass" },
  ],
  repeatN: 5,
};

export default example;
