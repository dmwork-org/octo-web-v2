# octo-web

> 基于 [`miaoa-fe-harness`](../../../miaoa/miaoa-fe-harness) 约束的前端业务项目。

陈超团队前端栈:**React + TanStack 全家桶 + Vite+ + Tailwind v4 + shadcn/ui + pnpm**。
本仓库的约束语义、哲学、绝对禁止、工作约束见根目录 `CLAUDE.md`(Claude Code 自动加载)。

## 常用命令

```bash
pnpm install                 # 装依赖
pnpm dev                     # 起 dev server(vp dev)
pnpm build                   # 构建(tsc -b + vp build)
pnpm check                   # vp check(Oxlint + Oxfmt + typecheck 一站式)
pnpm typecheck               # tsc --noEmit
pnpm run structure-lint      # 路径规范(读 package.json.harness.generatedDirs 豁免)
pnpm run wiki-lint           # 三角一致性(rules ↔ skills ↔ evals)
pnpm dlx shadcn@latest add <component>   # 加 shadcn 组件(写到 src/components/ui/)
```

## 加 TanStack 代码前(硬约束)

**必须**先查官方文档,否则 hook 会拦截:

```bash
tanstack doc <topic>
tanstack search-docs "<keyword>"
```

## 目录速览

```
.claude/        # hooks + rules + skills(Claude Code 自动加载)
.ai/            # taste/ + evals/ + canonical/(品味规则 + 评估)
.specify/specs/ # PRD 入口(spec-kit 格式)
scripts/        # taste-lint / wiki-lint / harness-health / ...
docs/sync-log.md # 与 miaoa-fe-harness 的同步记录
src/            # 业务代码
```

## Harness 来源与同步策略

- 来源:`/Users/nancy/Desktop/workspace/miaoa/miaoa-fe-harness`(commit 见 `docs/sync-log.md`)
- 策略:**完全拷贝、独立进化**(n=1 阶段不抽 meta-harness)
- 升级:有需要再人工 diff 回灌,不做自动 sync
