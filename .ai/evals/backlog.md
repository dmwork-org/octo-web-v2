# evals backlog

> **观察池**。看到了 CC 产出问题，但**还没决定是否抽成正式 eval** 的 failure 记这里。
>
> 规则：出现**第 2 次**才提成正式 eval（CLAUDE.md 哲学 §8 "先跑 n=1 再抽象"）。
> 一条 backlog 条目超过 **30 天** 只出现 1 次 → 归档（移到本文件末尾 "Archived" 区）。
>
> 配套迭代守则见 [handoff §14](../../docs/handoff.md#十四evals-迭代守则)。

---

## 格式

每条 backlog 一个 bullet，必须有以下字段：

```md
- **YYYY-MM-DD** · [PR/trace link] · count: N
  - **现象**：一句话描述 CC 产出了什么违规代码（或违反了哪条隐性规则）
  - **触发上下文**：哪个 pilot 项目哪个任务
  - **暂判**：疑似违反 `<rule-id>` / 疑似需要新规则 / 纯偶发
  - **动作**：observe / promote-to-eval / new-rule / discard
```

`count` 字段每次再次观察到同类现象就 +1。

---

## Active

- **2026-06-26** · issue #192 · count: 1
  - **现象**：规则 eval 骨架缺少 `_golden-output.tsx`,runner 无法执行。
  - **触发上下文**：`.ai/evals` active 顶层目录中只有 `a6-no-useeffect-in-component`
    有 golden。
  - **暂判**：A1/A2/A3/A5/B1/B2/B4/D1/D2/D3/D4/D6/D7/D8 暂不具备正式 eval 条件。
  - **动作**：moved-to `_backlog/`;补 golden 和可执行断言后再 promote-to-eval。

---

## Promoted（已晋升为正式 eval，保留链接以追溯）

<!-- 条目格式：**YYYY-MM-DD** → `.ai/evals/<dir>/` — 简述 -->

_暂无。_

---

## Archived（30 天单次观察未复现，归档）

_暂无。_
