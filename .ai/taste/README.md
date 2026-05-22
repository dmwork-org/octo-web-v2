# taste

**品味规则**。vp check 抓不到的团队品味，走这里。

## 两份文件，一个 source of truth

| 文件       | 用途                                                      | 读者                                                |
| ---------- | --------------------------------------------------------- | --------------------------------------------------- |
| `rules.md` | **规则定义**：每条规则的"正-反-例外"三段式规格            | 人（你 / 队友 / CC 的 system prompt）               |
| `rules.ts` | **机器注册表**：id / severity / implementedBy / mdSection | linter 实现层（Oxlint JS Plugin / ts-morph 逃生口） |

**规则定义只在 `rules.md` 一份**。`rules.ts` 只是索引和实现状态。两者通过 `id` 绑定。

## rules.md 的三段式规范

每条规则必须三段齐全，缺一不可：

```markdown
### <id> — <一句话规则>

**正例** — 符合规则的代码片段
**反例** — 违反规则的代码片段（要真实常见的错误形态）
**例外** — 什么情况下这条规则不适用（没有例外就写"无"，但要慎重）
```

**为什么强制例外**：LLM 在边界 case 会崩，没有例外条款等于强制绝对化，反而诱发 hack。**明确写"无例外"**和**明确列例外**都 OK，**不写**不 OK。

## rules.ts 的机器注册表格式

```ts
export const rules: RuleRegistry = {
  "no-useeffect-fetch": {
    severity: "error", // error | warn | off
    mdSection: "#no-useeffect-fetch", // 锚点指向 rules.md 对应节
    implementedBy: "oxlint", // oxlint | ts-morph | pending
    appliesTo: ["*.tsx", "*.ts"],
  },
  // ...
};
```

## taste-ignore 指令

单次跳过用：

```tsx
// taste-ignore-next-line: 这个 effect 监听 window resize，loader 不适用
useEffect(() => {...}, [])
```

- 必须带 reason，长度 > 10 字符
- 累计 ignore 率进 metrics，`> 30%` → 该规则进入**淘汰候选**（handoff §13.5 健康审查）

## 规则演化流程

```
陈超 / 项目 PR 里出现新的品味判断
      ↓
  加草稿条目到 rules.md（三段式）+ rules.ts 条目 severity: 'warn'
      ↓
  试跑 2-4 周，收集 ignore 率 + 误报率
      ↓
  ┌── ignore 率低 & 误报低 → 升 'error'
  ├── ignore 率高 → 弱化 or 加例外条款
  └── 误报高 → 降 'warn' 或撤回
```

## 20 条初稿的来源

见 `rules.md` 和 `docs/handoff.md` §6。分类：

- A. TanStack Router（5）
- B. TanStack Query（4）
- C. TanStack CLI 硬约束（3）
- D. Stack 通用（8）
