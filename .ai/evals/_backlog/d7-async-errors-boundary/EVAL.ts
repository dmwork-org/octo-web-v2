/**
 * d7-async-errors-boundary — 骨架
 *
 * Week 3-4 补全 assertion 细节。当前只占位 taste-rule 主断言。
 */
import type { EvalCase } from "../_framework/types";

const c: EvalCase = {
  id: "d7-async-errors-boundary",
  intent: "异步错误必须 catch 或走 error boundary,不裸 await",
  assertions: [
    { kind: "taste-rule", rule: "async-errors-to-boundary", expect: "pass" },
    // TODO(week-3-4): 补 AST / vp-check / custom 交叉验证
  ],
  repeatN: 5,
};

export default c;
