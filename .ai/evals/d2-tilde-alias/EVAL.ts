/**
 * d2-tilde-alias — 骨架
 *
 * Week 3-4 补全 assertion 细节。当前只占位 taste-rule 主断言。
 */
import type { EvalCase } from "../_framework/types";

const c: EvalCase = {
  id: "d2-tilde-alias",
  intent: "跨模块 import 走 ~/,不走 ../../",
  assertions: [
    { kind: "taste-rule", rule: "tilde-alias-import", expect: "pass" },
    // TODO(week-3-4): 补 AST / vp-check / custom 交叉验证
  ],
  repeatN: 5,
};

export default c;
