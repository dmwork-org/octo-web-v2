# Phase A — contract only

Skill `implement-design-spec` 在 Phase A 只落 SKILL.md(契约 + 翻译表 + 禁忌),不带示范代码。

**为什么不在 Phase A 写示范**:

- 哲学 6:示范必须指向 pilot 真实组件文件,不能造假范本
- 第一个 pilot feature(`real-person-library`,playground 已 publish)还没在 harness 仓真跑过
- 真跑一次会暴露 K11+(像 cli-debt 那套 vp / pnpm 坑),先记录再抽规则

**Phase B 触发条件**(到时再补):

1. 用户 / 项目负责人指派 `real-person-library` 派单
2. 在 combine-app 或 pilot 仓跑 `pnpm dlx shadcn@latest add` 拉稿
3. 按 SKILL.md 翻译 + 落到 `src/routes/portrait/list.tsx`
4. 真实生成的代码沉淀为:
   - `example-from-playground.tsx`(useSearch + Query 翻译范本)
   - `example-with-mutation.tsx`(删除流程 mutation + invalidate 范本)
   - `.claude/rules/design-refs-readonly.md`(builtin oxlint no-restricted-imports)
   - `.ai/evals/implement-design-spec/`(PROMPT.md + EVAL.ts + \_golden)
   - `.ai/taste/oxlint-plugin/` 加 `no-design-refs-import` AST 规则(若 builtin 不够细)

## Contract 上游

`miaoa-design-playground/docs/harness-integration.md`(2026-05-20)
