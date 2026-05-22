/**
 * d1-no-any — 骨架
 *
 * Week 3-4 补全 assertion 细节。当前只占位 taste-rule 主断言。
 */
import type { EvalCase } from "../_framework/types";

const c: EvalCase = {
  id: "d1-no-any",
  intent: "产出代码不得含 any / as any / @ts-ignore",
  assertions: [
    { kind: "taste-rule", rule: "no-any", expect: "pass" },
    // TODO(week-3-4): 补 AST / vp-check / custom 交叉验证
  ],
  repeatN: 5,
};

export default c;
