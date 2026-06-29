# OCTO Web v2

OCTO Web v2 是 OCTO 协作工作台的新一代 Web 客户端，覆盖会话、联系人、事项、摘要、分身、应用机器人和空间管理等能力。

这个仓库是升级版 OCTO Web 客户端的开源准备线。它来源于早期 `octo-web` 项目，但已经从老的多包结构收敛为 `src/features/*` 下的单应用结构。

English version: [README.md](README.md).

## 当前状态

本项目正在为公开发布做准备。Web 客户端内核处于活跃开发状态，但开源发布外壳仍在补齐。

当前范围：

- 仅浏览器 Web 客户端。
- React 19 单页应用。
- 基于 `src/features/*` 的 feature 边界。
- 通过 `ofetch` 和类型化 endpoint 模块访问 API。
- 基于 TanStack Router、Query、Store 等库组织路由、loader、URL 状态和缓存。

当前不包含：

- 老项目中的 Electron 桌面端打包。
- 老项目中的浏览器插件打包。
- 内部 GitLab CI、Docker 镜像发布或 Kubernetes 部署清单。

## 技术栈

- React 19
- TypeScript 6
- TanStack Router、Query、Store、Form、Table、Virtual、Hotkeys
- Vite+ (`vp`)
- Tailwind CSS v4
- shadcn/ui copy-in 组件
- ofetch
- pnpm

## 快速开始

```bash
git clone https://github.com/dmwork-org/octo-web-v2.git
cd octo-web-v2
pnpm install
cp .env.example .env.local
pnpm dev
```

如果你的后端服务不在默认地址，请先修改 `.env.local`。

## 环境变量

本项目使用 Vite 客户端变量：

| 变量                         | 用途                                                             |
| ---------------------------- | ---------------------------------------------------------------- |
| `VITE_API_BASE_URL`          | 浏览器侧 API base path，通常是 `/v1`。                           |
| `VITE_API_URL`               | 开发服务器代理目标，覆盖 OCTO API、Matter、Summary 等 endpoint。 |
| `VITE_ENABLE_ENTERPRISE_SSO` | 设为 `true` 时启用企业 SSO 登录路径。                            |

`pnpm dev` 会通过 Vite proxy 做本地开发代理。生产构建产物是静态资源，需要由网关把 `/v1`、`/matter/api/v1` 和 `/summary/api/v1` 路由到对应服务。

## 常用脚本

```bash
pnpm dev              # 启动 Vite+ dev server
pnpm build            # 类型检查并构建
pnpm check            # 运行 Vite+ 检查
pnpm typecheck        # 运行 TypeScript no emit 检查
pnpm run structure-lint
pnpm run wiki-lint
pnpm run scan:upstream
```

仓库中也包含 Vitest 测试，CI 会通过 Vite+ 运行测试。

## 架构

顶层结构：

| 路径                    | 作用                                                           |
| ----------------------- | -------------------------------------------------------------- |
| `src/routes`            | TanStack file-based routes。                                   |
| `src/features/base`     | 共享 API client、鉴权、空间状态、IM provider 和基础 endpoint。 |
| `src/features/chat`     | 会话、消息、频道设置、文件预览和聊天状态。                     |
| `src/features/contacts` | 联系人和组织视图。                                             |
| `src/features/matter`   | Matter 工作流视图和 API。                                      |
| `src/features/summary`  | 会话摘要视图和 API。                                           |
| `src/features/appbot`   | 应用机器人视图和 API。                                         |
| `src/features/persona`  | 分身视图和 API。                                               |
| `src/components`        | 共享 UI、富文本、数据和兼容组件。                              |
| `src/lib`               | Router、query client、i18n 和共享工具。                        |
| `docs`                  | 迁移记录、架构说明和 upstream 同步记录。                       |

部分 feature 包含 `MANIFEST.md`，用于说明职责、入口和局部约束。

## 开发规则

- 使用 TanStack Router file routes，不手写 route object。
- 使用 route loader 和 TanStack Query 管理服务端状态。
- 使用 `ofetch` client，不直接裸 `fetch`。
- URL 状态放在 router search params 中，不放在组件本地 state。
- SDK 兼容例外必须收敛在 adapter 边界。
- 提交前运行 `npx tsc -b`，因为 Vite build 不能替代 TypeScript project check。

更多 agent-oriented 规则索引见 [AGENTS.md](AGENTS.md)。

## 贡献

提交 pull request 前请先阅读 [CONTRIBUTING.zh.md](CONTRIBUTING.zh.md)。

安全问题请按 [SECURITY.zh.md](SECURITY.zh.md) 上报，不要提交公开 issue。

## 许可证

Apache License 2.0。详见 [LICENSE](LICENSE) 和 [NOTICE](NOTICE)。
