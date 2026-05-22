/**
 * a2-url-state-via-usesearch — 骨架
 *
 * Week 3-4 补全 assertion 细节。当前只占位 taste-rule 主断言。
 */
import type { EvalCase } from "../_framework/types";

const c: EvalCase = {
  id: "a2-url-state-via-usesearch",
  intent: "URL 状态(分页/筛选/排序)用 useSearch,不用 useState",
  assertions: [
    { kind: "taste-rule", rule: "url-state-via-usesearch", expect: "pass" },
    // TODO(week-3-4): 补 AST / vp-check / custom 交叉验证
  ],
  repeatN: 5,
};

export default c;
