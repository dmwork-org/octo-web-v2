# canonical

**团队认可的代码范本**。每个 canonical 是一份**指针**，指向项目里真实代码的某个位置 + sha。**禁止造假例子**（CLAUDE.md §禁止）。

## 一个 canonical 长这样

```ts
// .ai/canonical/route-with-loader.ts
import type { Canonical } from "./types";

export default {
  id: "route-with-loader",
  path: "src/routes/posts.tsx",
  pinned_sha: "abc1234", // 锁到具体 commit
  intent: "用 loader 预取列表数据，不用 useEffect + fetch",
  tags: ["router", "query", "data-fetching"],
  tanstack_refs: ["router.createFileRoute", "router.loader", "query.ensureQueryData"],
} satisfies Canonical;
```

## 命名：意图驱动，不是技术描述

- ✅ `route-with-loader` / `optimistic-mutation` / `form-array-fields`
- ❌ `example-1` / `posts-page` / `router-demo`

见 handoff §5 的 15 个候选清单。

## 为什么必须指向真实代码

1. **禁止造假例子**（CLAUDE.md + handoff §1）—— canonical 是 single source of truth，不能是为了演示拼凑的假代码
2. **shadcn 已经在 repo 里**（handoff §7.2）—— canonical 应是"组合 shadcn + TanStack + Tailwind 的模式"，不是重造组件
3. **CC 消费 canonical 时会去读 pinned_sha 版本的真实文件**，造假会导致 CC 学到假模式

## sha 锁定 + freshness 检查

- `pinned_sha` 锁到某个 commit，防止指向的代码被改烂了 harness 不知情
- 未来 `scripts/canonical-freshness.ts`（Week 3-4）定期检查 `pinned_sha` 对应文件 vs 当前文件的 diff
- 不匹配 → 提示项目负责人判断：**升级 pin / 换指针 / 废弃该 canonical**

## 何时新增 canonical

- pilot 重构过程中出现"想复用这个模式"的代码 → 立刻 pin 成 canonical
- 新 feature 开发中 CC 生成了质量过关的代码 → 经项目负责人判断可升 canonical
- 严禁"为了凑数量而列 canonical"

## 何时删除 canonical

- `pinned_sha` 指向的代码已被删除 / 大改
- 该模式已被更好的模式取代（新 canonical 上位）
- 季度健康审查（handoff §13.5）发现某 canonical 长期未被 CC 引用
