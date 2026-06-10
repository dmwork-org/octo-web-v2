---
name: implement-design-spec
description: Translate a playground design spec (shadcn registry URL or already-pulled src/design-refs/) into harness-conformant production code. Use when .specify/specs/<feature>/design-url.txt exists, OR src/design-refs/<project>/<feature>/ is present, OR user passes a https://miaoa-playground.mlamp.cn/r/*.json URL. Reads design intent + UI structure from design-refs/, rewrites useState→useSearch/Query, fetch→ofetch, useEffect→loader, then chains implement-route-with-query-loader for the final route+loader+component write. Produces no imports from design-refs/. Keywords design spec, playground registry, shadcn add, design translation, useState to useSearch, fixtures to TanStack Query, _shared AppShell ignore.
paths:
  - src/design-refs/**
  - .specify/specs/**/design-url.txt
metadata:
  owner: miaoa-fe-harness
  version: "0.1-draft"
  stack: react+tanstack-router+tanstack-query+shadcn
  status: phase-a-contract-only
  pilotFeature: real-person-library
---

# Implement Design Spec

> **Phase A 草稿** — contract 已定,示范代码待第一个 pilot(`real-person-library`)真跑后补。skill 此版本可触发 + 引导流程,但**禁忌清单 + 翻译表是硬规则**,跑通就生效。

## When to use

触发场景(三者满足其一):

1. `.specify/specs/<feature>/design-url.txt` 存在 → 自动读 URL + 拉稿 + 翻译
2. `src/design-refs/<project>/<feature>/` 已存在 → 直接读已拉的稿,跳过 `shadcn add`
3. 用户在对话里给 playground registry URL(`https://miaoa-playground.mlamp.cn/r/*.json`)→ 当成 case 1 处理(写入 design-url.txt 留档)

**与已有 skill 的关系(哲学 10:语义互斥)**:

- 与 [`implement-route-with-query-loader`](../implement-route-with-query-loader/SKILL.md) **不互斥但末端委托**:本 skill 负责"读设计稿 + 翻译",最终路由 + loader + 组件落地**调用**该 skill,保持单一来源
- paths 互斥:本 skill 触发于 `src/design-refs/**` 与 `.specify/specs/**/design-url.txt`,不与 `src/routes/**/*.tsx` 重叠

## Contract(Playground → Harness)

来自 `miaoa-design-playground/docs/harness-integration.md`,稳定不变量:

| 维度                   | 值                                                             |
| ---------------------- | -------------------------------------------------------------- |
| URL 形态               | `https://miaoa-playground.mlamp.cn/r/<project>/<feature>.json` |
| 协议                   | shadcn registry-item schema v4                                 |
| 落地路径前缀           | `src/design-refs/<project>/<feature>/`(`target` 字段强制)      |
| 链式 atoms             | `registryDependencies` 自动落到 `src/components/ui/`           |
| `_shared/*`            | playground 展示外壳,**不进生产**,生产用项目自己的 layout       |
| `page.tsx` 的 fixtures | 已被替换为 `const X: any[] = []` 占位,研发接真实数据源         |

## How(5 步)

### 1. 定位设计稿 URL

按下列优先级找 URL:

```
A. .specify/specs/<feature>/design-url.txt 单行 URL
B. 用户对话里直接给的 URL(写回 design-url.txt 留档)
C. src/design-refs/<project>/<feature>/ 已存在 → 跳到第 3 步
```

### 2. 拉设计稿到本地(若未拉)

```bash
pnpm dlx shadcn@latest add <playgroundRegistryURL>
```

shadcn CLI 自动:

- 链式拉缺的 atoms(从 miaoa-atoms registry)→ `src/components/ui/`
- 把 page.tsx / `_shared/*` / README.md 写到 `src/design-refs/<project>/<feature>/`
- npm install registry 声明的 dependencies(`lucide-react` / `sonner` 等)

**前置条件**:消费方有合法 `components.json`(harness pilot 默认有);若无,先 `pnpm dlx shadcn@latest init` 后再拉。

### 3. 读设计稿,提取 **视觉 + 交互**(忽略实现选择)

读 `src/design-refs/<project>/<feature>/`:

| 文件            | 读什么                                                                         | 不读什么                                                                    |
| --------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `README.md`     | 设计意图 + 业务规则 + 落地原则                                                 | -                                                                           |
| `page.tsx`      | UI 结构 + 状态变化(哪些 state 是 URL 状态、哪些是 server 状态、哪些是 UI 状态) | `useState` / `useEffect` / mock 数据的具体写法(那是设计师写稿手段,不是规范) |
| `_shared/*.tsx` | **不读**(playground 外壳,不进生产)                                             | -                                                                           |

### 4. 按 harness 规则翻译

视觉 + 交互 1:1 还原。实现层按下表硬翻译:

| 设计稿写的                                                      | harness 落地                                                                            | 理由                                                        |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `useState` 存 URL state(filters / page / sort / open dialog id) | `useSearch` + typed search params                                                       | URL 是 SSOT,刷新 / 分享 / 后退一致                          |
| `useState` 存 server state(列表 / 详情)                         | TanStack Query(`postQueries.*` factory + `useSuspenseQuery`)                            | 缓存 + 失效 + 重试统一,见 implement-route-with-query-loader |
| `useState` 存 UI state(input value / 折叠 open / 拖拽中)        | 保留 `useState`(允许)                                                                   | 纯 UI 状态无需上拉                                          |
| `useEffect + fetch`                                             | `createFileRoute` + `loader: ({ context }) => context.queryClient.ensureQueryData(...)` | 禁止 useEffect+fetch 链                                     |
| 裸 `fetch(...)`                                                 | `ofetch(...)`                                                                           | 拦截 + 错误统一                                             |
| 写操作 mock(setState 模拟提交)                                  | TanStack Query `useMutation` + `queryClient.invalidateQueries` + sonner toast           | 服务端真实流程 + UI 反馈                                    |
| `<Link href="...">` 或 `<a href="...">`                         | TanStack Router `<Link to="..." />`(类型安全)                                           | 类型化 + 预拉取                                             |
| 设计稿的 `_shared/AppShell`                                     | 项目自己的 layout(根 `__root.tsx` + 自有 navbar)                                        | `_shared/` 是 playground 展示外壳                           |
| 设计稿的 fixtures(`const X: any[] = []`)                        | 项目真实数据源 hook(loader + useSuspenseQuery)                                          | 占位仅写稿用                                                |

### 5. 落地路径 + 末端委托

- 路径来自 PRD(`.specify/specs/<feature>/spec.md` 写明 → 比如 `src/routes/portrait/list.tsx`)
- 路由 + loader + 组件骨架**调用** [`implement-route-with-query-loader`](../implement-route-with-query-loader/SKILL.md) 完成最终 write
- mutation 部分(若有)用 query factory + invalidate 模式

## 禁忌

- ❌ 任何生产路径 import `src/design-refs/*`(builtin oxlint `no-restricted-imports` 会拦,见对应 rule)
- ❌ 把 `_shared/AppShell.tsx` / `_shared/theme.css` 复制 / re-export 到生产
- ❌ 保留设计稿的 `useState + setTimeout` 模拟异步(应翻成真实 `useMutation`)
- ❌ 用 `any[]` 占位上线(必须接真实 API 返回类型)
- ❌ 跳过 `pnpm dlx shadcn@latest add`,手动复制粘贴 page.tsx 内容(会丢 atoms 链式 + dependencies install)
- ❌ 修改 `src/design-refs/**` 内文件(只读,下次 `shadcn add` 会覆盖)

## 范本

> **TODO(Phase B)**:`real-person-library` pilot 跑通后,写两份示范:
>
> - `example-from-playground.tsx` — 把设计稿的 useState 翻成 useSearch + TanStack Query
> - `example-with-mutation.tsx` — 设计稿的删除按钮 → ofetch + useMutation + toast
>
> 必须指向 pilot 真实代码(哲学 6:不造假范本)。

## 与 spec-kit 的边界(项目负责人已确认)

- `.specify/specs/<feature>/spec.md` = WHAT/WHY(业务需求,SSOT)
- `.specify/specs/<feature>/design-url.txt` = HOW 的 UI 部分(可选附件,1 行 URL)
- **冲突时**:spec 优先(业务为准);design 多出的交互由派单人回流到 spec.md,**不是 CC 自作主张**

## 相关 rule / eval

- rule:**TODO(Phase B)** — `no-design-refs-import`(等 pilot 跑通后基于真实违例样本写)
- eval:**TODO(Phase B)** — `.ai/evals/implement-design-spec/`(基于 `real-person-library` pilot)

## 源追溯

contract 来源:`miaoa-design-playground/docs/harness-integration.md`(playground 端 2026-05-20 落地)
