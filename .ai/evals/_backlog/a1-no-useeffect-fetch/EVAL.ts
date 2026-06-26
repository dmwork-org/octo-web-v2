/**
 * a1-no-useeffect-fetch — 骨架
 *
 * Week 3-4 补全 assertion 细节。当前只占位 taste-rule 主断言。
 */
import type { EvalCase } from "../_framework/types";

const c: EvalCase = {
  id: "a1-no-useeffect-fetch",
  intent: "列表页拉数据用 loader,不用 useEffect + fetch",
  assertions: [
    { kind: "taste-rule", rule: "no-useeffect-fetch", expect: "pass" },
    // TODO(week-3-4): 冗余 AST 交叉验证
    // { kind: 'ast-absent', pattern: 'useEffect(', expect: true },
    // { kind: 'ast-absent', pattern: 'fetch(', expect: true },
    // { kind: 'vp-check', expect: 'pass' },
  ],
  repeatN: 5,
};

export default c;
