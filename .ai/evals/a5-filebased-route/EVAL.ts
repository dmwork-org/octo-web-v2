/**
 * a5-filebased-route — 骨架
 *
 * Week 3-4 补全 assertion 细节。当前只占位 taste-rule 主断言。
 */
import type { EvalCase } from "../_framework/types";

const c: EvalCase = {
  id: "a5-filebased-route",
  intent: "用 createFileRoute,不手写 new Route(...)",
  assertions: [
    { kind: "taste-rule", rule: "use-filebased-route", expect: "pass" },
    // TODO(week-3-4): 补 AST / vp-check / custom 交叉验证
  ],
  repeatN: 5,
};

export default c;
