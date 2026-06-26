/**
 * d4-extend-shadcn — 骨架
 *
 * Week 3-4 补全 assertion 细节。当前只占位 taste-rule 主断言。
 */
import type { EvalCase } from "../_framework/types";

const c: EvalCase = {
  id: "d4-extend-shadcn",
  intent: "扩展 shadcn 用 cn + cva,不 fork components/ui",
  assertions: [
    { kind: "taste-rule", rule: "extend-shadcn-with-cn-cva", expect: "pass" },
    // TODO(week-3-4): 补 AST / vp-check / custom 交叉验证
  ],
  repeatN: 5,
};

export default c;
