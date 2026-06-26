# octo-web — Agent Index

> Schema 索引 — 给外部 agent(龙虾 / 其他 harness)用来发现本 repo 的能力与约束。
> 本文件遵循 [AGENTS.md 跨工具标准](https://agents.md/)(OpenAI/Google/Anthropic 共识)。
> 详细哲学/禁止/目录语义见 `CLAUDE.md`。本文件只做**索引**,不重复。

## Stack

- React + TanStack 全家桶(Router / Query / Table / Form / Store / Hotkeys / Virtual)
- Vite+ (`vp`) — build + Oxlint + Oxfmt + typecheck 一站式
- Tailwind v4+
- shadcn/ui(copy 进 repo)
- pnpm(包管理器)

## Conventions

- **类型**:禁 `any` / `as any` / `@ts-ignore`
- **数据**:禁 `useEffect + fetch`(用 `loader`);禁裸 `fetch`(用 `ofetch`)
- **路由**:禁手写 Route 对象(用 `createFileRoute`);禁 `useState` 存 URL 状态(用 `useSearch`)
- **风格**:`vp check --fix` 是硬规则底座,一切自动化修复以它为准
- **TanStack**:写 TanStack 代码前必须 `tanstack doc <topic>` 查官方文档
- **Commit**:commit 前跑 `vp check`,hook 会自动拦截
- **CI/CD 提交前必跑 `tsc -b`**:`vp build`(Vite)不做类型检查,本地能过但 CI 跑 `tsc -b && vp build` 会因类型错误 exit code 2 挂掉。常见坑:未使用的 import/变量(TS6133)、访问不存在的属性(TS2339)、类型不兼容(TS2345)。提交前务必 `npx tsc -b` 确认零错误

## Commands

| 目的                     | 命令                                                  |
| ------------------------ | ----------------------------------------------------- |
| 装依赖                   | `pnpm install`                                        |
| 加依赖                   | `pnpm add <pkg>` / `pnpm add -D <pkg>`                |
| 类型检查(CI 前必跑)      | `npx tsc -b`                                          |
| build + lint + typecheck | `vp check --fix`                                      |
| 查 TanStack 文档         | `tanstack doc <topic>` / `tanstack search-docs "<q>"` |
| 加 shadcn 组件           | `pnpm dlx shadcn@latest add <component>`              |
| taste 规则注册表健康检查 | `pnpm run taste-health`(建设中,B11)                   |
| 跑 eval                  | `pnpm run eval <eval-id>`(建设中,B13)                 |
| 跑 wiki-lint             | `pnpm run wiki-lint`(建设中,B18)                      |
| harness health 周报      | `pnpm run harness-health`(建设中,B20)                 |

## Skills index

> 任务导向(动词粒度),单个 skill 覆盖一类任务的所有变体。10-15 个封顶。
> 每个 skill frontmatter 必含 `description` + `paths:`,两两互斥(见 CLAUDE.md 哲学 10)。

已建:

| Skill                                | Paths 触发                                                                   | 用途                                                                             |
| ------------------------------------ | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `implement-route-with-query-loader`  | `src/routes/**/*.tsx`                                                        | file-based route + loader + ensureQueryData + useSuspenseQuery                   |
| `implement-design-spec`              | `.specify/specs/<feature>/design-url.txt` 或 `src/design-refs/**`            | shadcn registry JSON 设计稿翻译为生产代码(Phase A)                               |
| `implement-auth-guard`               | `src/routes/_auth*`、`src/routes/login*`、`src/features/base/stores/auth.ts` | beforeLoad + throw redirect + TanStack Store auth 守卫                           |
| `implement-ofetch-interceptor`       | `src/features/base/api/**`、`src/lib/api.ts`                                 | ofetch 单例 + 5 个独立拦截器(authToken / spaceHeader / reqId / 401 / errorToast) |
| `implement-mutation-with-invalidate` | `src/features/**/mutations.ts`                                               | useMutation + invalidateQueries(queryKey 走 factory)                             |

待建(P1-P4 pilot 驱动落地,见 `~/.claude/plans/users-nancy-desktop-workspace-octo-octo-jaunty-rabbit.md`):

| Skill                             | Paths 触发                                | 覆盖变体                                  | 落地阶段 |
| --------------------------------- | ----------------------------------------- | ----------------------------------------- | -------- |
| `implement-typed-search-params`   | `src/routes/**/*.tsx` 含 `validateSearch` | useSearch / debounced / zod schema        | P1       |
| `implement-im-provider`           | `src/features/base/providers/IM*`         | wukongimjssdk 适配 + Store 暴露 + Adapter | P2       |
| `implement-virtual-list`          | 含 `useVirtualizer`                       | virtual + query / message list            | P2       |
| `implement-form`                  | `src/features/**/components/*Form*.tsx`   | TanStack Form + async-validation          | P3       |
| `implement-table-with-pagination` | 含 `useReactTable`                        | sort / filter / paginate                  | P3       |
| `implement-infinite-list`         | 含 `useInfiniteQuery`                     | 历史消息分页 / 联系人无限滚动             | P3       |
| `implement-rich-editor`           | 含 `@tiptap`                              | TipTap 封装 + slash menu                  | P4       |
| `implement-hotkeys`               | 含 `useHotkeys`                           | global / scoped                           | P4       |

## Rules index

> 全局规则(Claude Code 按 `paths:` frontmatter 自动注入)。
> 详细规则文本见 `.ai/taste/rules.md`;机器可检版本 `.ai/taste/rules.ts`(18 条)。

待建(Step 4 Batch 2 产出):

| A1-A6 | Router | `src/routes/**` | no-useeffect-in-component / no-useeffect-fetch / use-filebased-route / ... |
| B1-B4 | Query | `src/**` | mutation-invalidates / querykey-factory / ... |
| D1-D8 | Generic | `src/**` | no-any / fetch-via-ofetch / forwardref-displayname / ... |

## Evals index

> PROMPT.md + EVAL.ts 对应 `.ai/taste/rules.ts` 一一对应。20 条骨架已建。
> 详见 `.ai/evals/README.md`。

## 调用方式(外部 agent)

### 龙虾 / 外部 harness 通过 CLI 调用

```bash
claude -p "$PRD_TEXT" \
  --session-id=<feature-slug> \
  --setting-sources user \
  --permission-mode bypassPermissions
```

- PRD 落盘路径:`.specify/specs/<feature>/spec.md`(spec-kit 格式)
- 产出 trace:`.ai/traces/<date>/<session>.jsonl`(含 cost / duration / tool calls)

## 当前阶段

**Step 4 基建逐砖验证中**(18 砖,详见 `docs/step4-verify-plan.md`)。本 index 中带"待建"标记的项会随 Batch 进度更新。

---

<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `npx tsc -b` to type-check — CI runs `tsc -b && vp build`, local `vp build` skips type checks.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.

<!--VITE PLUS END-->
