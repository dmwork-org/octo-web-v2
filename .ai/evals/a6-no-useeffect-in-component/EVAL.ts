/**
 * a6-no-useeffect-in-component — eval case
 *
 * Step 4 MVP: runner 对 _golden-output.tsx 跑 vp check,验 taste-rule 断言。
 * Step 5: live claude -p 产 src/routes/orders/index.tsx,对齐同一断言集。
 */
import type { EvalCase } from "../_framework/types";

const c: EvalCase = {
  id: "a6-no-useeffect-in-component",
  intent: "component 本体禁止裸 useEffect,必须抽到命名 use* hook",
  targetFile: "src/routes/orders/index.tsx",
  assertions: [
    { kind: "taste-rule", rule: "no-useeffect-in-component", expect: "pass" },
    { kind: "taste-rule", rule: "no-useeffect-fetch", expect: "pass" },
    { kind: "vp-check", expect: "pass" },
  ],
  repeatN: 5,
};

export default c;
