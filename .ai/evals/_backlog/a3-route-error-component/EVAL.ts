/**
 * a3-route-error-component — 骨架
 *
 * Week 3-4 补全 assertion 细节。当前只占位 taste-rule 主断言。
 */
import type { EvalCase } from "../_framework/types";

const c: EvalCase = {
  id: "a3-route-error-component",
  intent: "带 loader 的路由必须配 errorComponent",
  assertions: [
    { kind: "taste-rule", rule: "route-error-component-required", expect: "pass" },
    // TODO(week-3-4): 补 AST / vp-check / custom 交叉验证
  ],
  repeatN: 5,
};

export default c;
