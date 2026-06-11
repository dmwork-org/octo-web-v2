# octo-web

> 基于 miaoa-fe-harness 约束的业务项目。
> 目标：用结构化约束让 Claude Code / CC 产出符合团队品味的代码。

## Who

**项目负责人**，前端团队 lead。这不是通用 harness，不对外发布，只服务**本团队的标准技术栈**。

## 技术栈（硬绑定）

- **React** + **TanStack 全家桶**（Router / Query / Table / Form / Store / Hotkeys / Virtual）
- **Vite+** (`vp`) — 一站式 build + lint(Oxlint type-aware) + format(Oxfmt) + typecheck
  - ref: https://voidzero.dev/posts/announcing-vite-plus-alpha
- **Tailwind v4+**
- **shadcn/ui**（组件 copy 进 repo，修改直接改源文件）
- **pnpm** — 包管理器(workspace / 严格 phantom deps / disk-efficient)

## 哲学（背下来）

1. **Vertical harness > 大而全平台** — 只服务自己团队的栈
2. **基建 > Agent** — 数据 / schema / eval 比 "多少个 agent" 重要
3. **Harness engineering > Context engineering** — 用代码约束（hooks / linter / eval），不靠 prompt 祈祷
4. **Vite+ 已经做了 70% 的 QA** — `vp check --fix` 就是硬规则底座，别重造
5. **TanStack CLI 是免费 MCP** — 写 TanStack 代码前必须 `tanstack doc <topic>` 查文档
6. **shadcn 已经在 repo 里** — skill 内示范代码指向真实组件文件，不造假范本
7. **Eval-driven iteration** — 每条品味规则必须有机器可检的断言
8. **先跑 n=1 再抽象** — 不提前抽 meta-harness，等第 2 个 vertical 用上再归纳
9. **Wiki 三角一致性** — rules ↔ skills(含示范) ↔ evals 闭合,`wiki-lint` 机器检(Karpathy LLM Wiki 模式)
10. **Skill 语义互斥 > Skill 数少** — skill 以任务粒度(动词)组织,同任务多范本共存一个 skill;两 skill 的 `description` + `paths:` 必须互斥,避免触发冲突(primary:arxiv 2603.22455)

## 绝对禁止

- ❌ `any` / `as any` / `@ts-ignore`
- ❌ `useEffect + fetch`（用 `loader`）
- ❌ `useState` 存 URL 状态（用 `useSearch`）
- ❌ 手写 Route 对象（用 `createFileRoute`）
- ❌ 裸 `fetch`（用 `ofetch`）
- ❌ Agent 间传自然语言（只传 schema 化 JSON + `schema_version`）
- ❌ 早用 LangGraph / CrewAI / AutoGen（100 行 TS 写清楚的不上框架）
- ❌ 把 IM 当 agent 协作层
- ❌ Skill 示范代码里放造的范例（必须是 pilot 项目真实代码）
- ❌ 发布 npm package / 做 web dashboard / 做移动端
- ❌ 在 n=1 时抽 meta-harness
- ❌ 跳过 7 步方法论（定义→验证定义→列基建→验证基建→combine→验证项目→生产）
- ❌ `wiki-lint` 报 orphan / stale / 语义冲突不补,硬推下一步
- ❌ 按 pattern 粒度拆 skill（应按 task 粒度;同 task 多范本共存一 skill）

## 目录语义

```
CLAUDE.md                    # 项目根指令(Claude Code 自动加载)
AGENTS.md                    # Schema 索引(Stack / Conventions / Skills index / Rules index)
.claude/
├── rules/                   # 全局规则(frontmatter `paths:` 匹配自动注入,description 互斥)
├── skills/<task>/           # 任务导向 skill(动词粒度,10-15 个封顶)
│   ├── SKILL.md             #   指令 + description(与其他 skill 互斥)
│   └── example-*.tsx        #   多个示范(同任务不同变体,co-located)
└── hooks/                   # session-start / pre-tool-use / post-tool-use / stop
.specify/
└── specs/<feature>/         # PRD 入口(spec-kit 格式,龙虾派单落盘处)
.ai/
├── taste/                   # rules.ts(机器可检) + rules.md(人可读)
├── evals/                   # PROMPT.md + EVAL.ts + backlog.md
└── traces/<date>/*.jsonl    # 含 OTel 字段(ts / session / tool / cost / duration)
docs/                        # handoff / step4-verify-plan / 方法论
scripts/                     # taste-lint / run-evals / wiki-lint / ingest-failure / harness-health
```

## 当前阶段

**7 步方法论 Step 4 — 基建逐砖验证中**(18 砖,详见 `docs/step4-verify-plan.md`)。
**Step 1-3 已闭合**:定义 → 业界共鸣校验 → 18 砖锁定(Karpathy wiki 模式)。
**Step 5-7**:Combine → 项目 verify → 生产,待 Step 4 全绿后进。

## 工作约束（每次对话遵守）

- **下任务前**：读 `docs/handoff.md` + `docs/step4-verify-plan.md` 对齐
- **写代码前**：触发对应 skill(paths 自动匹配 或 `/<skill-name>`);skill 内 `@` 引用示范 + `@src/lib/*` 引用基础设施
- **写 TanStack 代码前**：**必须** 先 `tanstack doc <topic>` 或 `tanstack search-docs "<keyword>"`
- **改动前**：优先 Ask，不自作主张
- **回应偏好**：简洁、直接、少铺陈（本团队不喜欢大而全叙事和过度抽象）
- **决策偏好**：量化 > 感觉（用 metrics 说话）
- **方法论**:严格 7 步不跳步;证据源优先级 Anthropic > OpenAI > Vercel > Meta > X > GitHub > AI 大佬 > 其他
