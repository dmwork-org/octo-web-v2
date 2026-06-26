# evals

**可执行品味验证**。用真实 prompt + 真实断言检验 CC 产出是否达标。

## 每个 eval 是一对文件

```
.ai/evals/
├── _framework/              # 运行器和类型定义（跨 eval 共享）
│   ├── types.ts
│   └── runner.ts
├── list-with-loader/        # 一个 eval case
│   ├── PROMPT.md            # 给 CC 的任务（自然语言）
│   └── EVAL.ts              # 对 CC 产出的机器断言
├── optimistic-mutation/
│   ├── PROMPT.md
│   └── EVAL.ts
└── ...
```

## PROMPT.md 格式

```markdown
# <eval id>

## Intent

一句话：这个 eval 在验证什么品味

## Setup

（可选）给 CC 的前置代码 / mock 数据 / context

## Task

给 CC 的自然语言任务，越像真实开发指令越好

## Expected tanstack_refs

（可选）CC 理想情况下该查的 TanStack doc 列表
```

## EVAL.ts 格式

```ts
import type { EvalCase } from "../_framework/types";

export default {
  id: "list-with-loader",
  assertions: [
    { kind: "taste-rule", rule: "no-useeffect-fetch", expect: "pass" },
    { kind: "taste-rule", rule: "use-filebased-route", expect: "pass" },
    { kind: "ast-contains", pattern: "loader:", expect: true },
    { kind: "ast-absent", pattern: "useEffect(", expect: true },
    { kind: "vp-check", expect: "pass" },
  ],
} satisfies EvalCase;
```

**断言种类**（Week 3-4 落地时可能调整）：

- `taste-rule` — 某条规则 pass / fail
- `ast-contains` / `ast-absent` — AST 层存在 / 不存在某模式
- `vp-check` — vp check --fix 是否通过
- `output-matches` — 输出文件匹配某 golden regex
- `custom` — 任意自定义断言函数

## 命名：意图驱动

和 canonical 同样原则（见 `.ai/canonical/README.md`）。

- ✅ `optimistic-mutation` / `nested-route-with-auth-guard`
- ❌ `test-1` / `mutation-example`

## Golden cases 的来源

- pilot 重构分支里碰到的真实场景 → eval
- handoff §5 的 15 个 canonical 候选 → 每个对应一个 eval
- 线上 bug / review comment → eval（把人 review 的判断转成机器断言）

## 指标

handoff §3 硬指标：**eval pass@1 ≥ 70%**。

单个 eval 运行 N 次（N 默认 5），成功率进 trace（`.ai/traces/{date}/*.jsonl`），用于监测**模型漂移**和**规则演化**的影响。

## 何时写新 eval

迭代守则见 [handoff §14 "Evals 迭代守则"](../../docs/handoff.md#十四evals-迭代守则)。简版：

- 新 taste rule 上线 → 至少一个 eval 覆盖
- 新 canonical 上线 → 对应一个"让 CC 照这个模式写"的 eval
- 出现 regression → 先补 eval 再修（不允许裸修）
- 观察到的 failure 但还没确认要不要抽 eval → 先记 [backlog.md](./backlog.md)

## 当前状态（Week 0 骨架）

- Active eval 只保留已具备 `_golden-output.tsx` 的可运行用例。
- 当前 active: `a6-no-useeffect-in-component`。
- 未补 golden / runner 断言的规则骨架已移到 `_backlog/`,避免 `pnpm run eval`
  看起来像质量门禁但实际不可运行。
- `pnpm run eval` 默认运行全部 active eval;`pnpm run eval <eval-id>` 可单跑。
