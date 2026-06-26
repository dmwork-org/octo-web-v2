/**
 * d3-theme-vars-for-colors — 骨架
 *
 * Week 3-4 补全 assertion 细节。当前只占位 taste-rule 主断言。
 */
import type { EvalCase } from "../_framework/types";

const c: EvalCase = {
  id: "d3-theme-vars-for-colors",
  intent: "Tailwind 颜色走 @theme 变量,不内联 #xxx",
  assertions: [
    { kind: "taste-rule", rule: "theme-variables-for-colors", expect: "pass" },
    // TODO(week-3-4): 补 AST / vp-check / custom 交叉验证
  ],
  repeatN: 5,
};

export default c;
