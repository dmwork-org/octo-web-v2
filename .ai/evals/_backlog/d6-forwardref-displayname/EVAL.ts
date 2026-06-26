/**
 * d6-forwardref-displayname — 骨架
 *
 * Week 3-4 补全 assertion 细节。当前只占位 taste-rule 主断言。
 */
import type { EvalCase } from "../_framework/types";

const c: EvalCase = {
  id: "d6-forwardref-displayname",
  intent: "用 forwardRef 必带 displayName",
  assertions: [
    { kind: "taste-rule", rule: "forwardref-has-displayname", expect: "pass" },
    // TODO(week-3-4): 补 AST / vp-check / custom 交叉验证
  ],
  repeatN: 5,
};

export default c;
