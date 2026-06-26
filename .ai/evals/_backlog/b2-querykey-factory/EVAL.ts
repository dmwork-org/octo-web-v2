/**
 * b2-querykey-factory — 骨架
 *
 * Week 3-4 补全 assertion 细节。当前只占位 taste-rule 主断言。
 */
import type { EvalCase } from "../_framework/types";

const c: EvalCase = {
  id: "b2-querykey-factory",
  intent: "跨文件复用的 queryKey 必须走工厂函数",
  assertions: [
    { kind: "taste-rule", rule: "querykey-via-factory", expect: "pass" },
    // TODO(week-3-4): 补 AST / vp-check / custom 交叉验证
  ],
  repeatN: 5,
};

export default c;
