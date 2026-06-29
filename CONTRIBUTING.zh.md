# 贡献 OCTO Web v2

感谢你有兴趣贡献 OCTO Web v2。

这个仓库是 OCTO 协作工作台的 Web 客户端。它是一个 React 19 单应用，按 `src/features/*` 组织 feature 模块。

## 开始之前

1. Fork 仓库，并从 `main` 创建分支。
2. 使用 `pnpm install` 安装依赖。
3. 复制 `.env.example` 为 `.env.local`，并指向你的后端服务。
4. 使用 `pnpm dev` 启动应用。
5. 保持改动聚焦；行为变化请补充测试。
6. 使用 PR 模板提交 pull request。

## 开发命令

```bash
pnpm install
pnpm dev
npx tsc -b
pnpm check
pnpm exec vp test
pnpm run structure-lint
```

## 代码风格

- TypeScript 代码禁止 `any`、`as any`、`@ts-ignore`，除非是明确注释的 SDK 边界适配。
- 使用 TanStack Router file routes。
- 使用 route loader 和 TanStack Query 管理服务端状态。
- 使用 `ofetch` client，不直接裸 `fetch`。
- API 模块放在 `src/features/base/api/endpoints` 或对应 feature 的 `api` 目录。
- 面向用户的 UI 文案应放在 i18n 文件中。
- 改动范围尽量收敛在当前 feature 内。

## 测试

修复 bug、调整 API 映射、修改状态逻辑、renderer 或核心用户流程时，请新增或更新测试。现有测试使用 Vitest。

高优先级测试区域：

- 登录和 token 处理
- API interceptors
- 空间切换
- IM provider 和消息渲染
- 聊天文件预览
- Matter 工作流
- Summary 渲染

## Pull Request

- 说明改了什么以及为什么改。
- 关联相关 issue。
- UI 变化请附截图或录屏。
- 写明你运行过的验证命令。
- PR 描述请使用英文，方便更广泛的社区阅读项目历史。

## Commit 规范

使用 Conventional Commits：

```text
feat: add channel search filter
fix: handle expired token redirect
docs: update setup guide
chore: refresh dependencies
```

## 安全问题

请不要通过公开 GitHub issue 报告安全问题。请按 [SECURITY.zh.md](SECURITY.zh.md) 处理。

## 许可证

提交贡献即表示你同意将贡献按本项目的 [Apache License 2.0](LICENSE) 发布。
