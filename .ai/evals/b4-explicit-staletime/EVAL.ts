/**
 * b4-explicit-staletime — 骨架
 *
 * Week 3-4 补全 assertion 细节。当前只占位 taste-rule 主断言。
 */
import type { EvalCase } from "../_framework/types";

const c: EvalCase = {
  id: "b4-explicit-staletime",
  intent: "useQuery 必须显式声明 staleTime(即便是 0)",
  assertions: [
    { kind: "taste-rule", rule: "explicit-staletime", expect: "pass" },
    // TODO(week-3-4): 补 AST / vp-check / custom 交叉验证
  ],
  repeatN: 5,
};

export default c;
