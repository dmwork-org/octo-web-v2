# .claude/ — Claude Code 配置

本目录存 Claude Code 的项目级配置，**跟仓库一起版本化**（handoff §1.3 原则）。

## 两份文件的分工

| 文件                  |         是否 git 跟踪          | 用途                                             |
| --------------------- | :----------------------------: | ------------------------------------------------ |
| `settings.json`       |            ✅ 跟踪             | 团队共享：hooks / permissions / 环境约定         |
| `settings.local.json` | ❌ 不跟踪（`.gitignore` 排除） | 个人 override：本机路径、个人 webFetch 白名单 等 |

## 当前阶段：Week 0 占位

```json
{
  "hooks": {
    "PostToolUse": [] // 空，Week 5-6 启用
  },
  "permissions": {
    "allow": [],
    "deny": []
  }
}
```

**现在什么都不做是故意的**：Week 0 只搭骨架，任何真实 hook 激活都会改变开发者体验，留到 Week 5-6 统一启用。

## Week 5-6 要启用的 hook 结构（规划）

PostToolUse hook 顺序（handoff §7.1 + §13.4）:

```jsonc
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "pnpm vp check --fix ${CLAUDE_TOOL_CHANGED_FILES}",
            "timeout": 30000,
          },
          {
            "type": "command",
            "command": "pnpm tsx scripts/taste-lint.ts --type-aware ${CLAUDE_TOOL_CHANGED_FILES}",
            "timeout": 60000,
          },
        ],
      },
    ],
  },
}
```

两步：

1. **vp check --fix** — Oxlint 内置 + Oxlint JS Plugin（taste rules 里 `implementedBy: oxlint-plugin` 的规则）+ Oxfmt + tsc
2. **taste-lint.ts --type-aware** — ts-morph 逃生口，跑 `requiresType: true` 的规则

任一失败 → CC 看到非零退出码，必须修后再试（本地劝告层）。

真正的把关在 CI（handoff §13.4 Level 4）：

- PR 触发 CI 跑 `vp check + taste-lint + run-evals`
- 失败红灯 → branch protection 拒 merge
- 只有陈超 admin override 能强推

## 关于 permissions

Week 0 允许/拒绝列表都为空，未来可能加：

- `deny`: 某些危险命令（`rm -rf /` 等），防误操作
- `allow`: 团队常用命令，减少每次询问

Week 3-4 落第一批真实 hook 时同步补。

## 关于 settings.local.json

**必须在 `.gitignore` 里**（已配置）。个人 override 不污染团队设置。典型用途：

- 本机特有的 WebFetch 域名白名单
- 本地开发数据库路径
- 个人偏好的 status line

**绝不把 secrets（API key / token）写进**本目录任何文件。如需本地 env，用 `.env.local`。
