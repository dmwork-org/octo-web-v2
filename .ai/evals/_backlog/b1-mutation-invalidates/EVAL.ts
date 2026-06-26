/**
 * b1-mutation-invalidates — 骨架
 *
 * Week 3-4 补全 assertion 细节。当前只占位 taste-rule 主断言。
 */
import type { EvalCase } from "../_framework/types";

const c: EvalCase = {
  id: "b1-mutation-invalidates",
  intent: "mutation 成功后用 invalidateQueries,不手动 refetch",
  assertions: [
    { kind: "taste-rule", rule: "mutation-invalidates", expect: "pass" },
    // TODO(week-3-4): 补 AST / vp-check / custom 交叉验证
  ],
  repeatN: 5,
};

export default c;
