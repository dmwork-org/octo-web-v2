/**
 * d8-fetch-via-ofetch — 骨架
 *
 * Week 3-4 补全 assertion 细节。当前只占位 taste-rule 主断言。
 */
import type { EvalCase } from "../_framework/types";

const c: EvalCase = {
  id: "d8-fetch-via-ofetch",
  intent: "网络请求走 ofetch,不裸 fetch()",
  assertions: [
    { kind: "taste-rule", rule: "fetch-via-ofetch", expect: "pass" },
    // TODO(week-3-4): 补 AST / vp-check / custom 交叉验证
  ],
  repeatN: 5,
};

export default c;
