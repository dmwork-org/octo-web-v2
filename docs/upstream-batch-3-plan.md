# 上游搬运 Batch 3 — 2026-06-22 截止可做范围

> 生成日期: 2026-06-26
> 文档分支: `codex/upstream-batch-3-records`，基于新仓 `origin/main`
> 新仓基线: `frontend/octo-web-2` `origin/main` = `d4f8b3c`
> 老仓路径: `/Users/houmenghao/project/octo/octo-web`
> 老仓上次记录点: `b884e01e` (`v1.4.3`)
> 本批可做截止时间: `2026-06-22 24:00:00 +0800`
> 本批可做截止 commit: `3f3059ee`
> 后续未上线内容已拆到 `docs/upstream-batch-4-plan.md`

## 目标

本批只记录**截至 2026-06-22 24:00:00 前**已经进入老仓、且可以进入迁移评估的 upstream 变更。

- 可做范围:`b884e01e..3f3059ee`，20 个 commit，113 files changed / +9446 / -765。
- 6 月 23 日之后合入老仓的内容本周尚未正式上线，已单独拆为 Batch 4 暂缓记录。
- 等项目负责人确认优先级后，再从可做范围里逐批开实现 MR。

## 可做提交清单

| SHA        | 时间(+0800)      | 标题                                                         | 处理方向            |
| ---------- | ---------------- | ------------------------------------------------------------ | ------------------- |
| `1eaa7a0c` | 2026-06-15 18:40 | summary ChatSelector tabs:关注 / 最近 / 全部群聊 / 全部私聊  | 待核对 P1           |
| `a109fe24` | 2026-06-15 19:50 | auto-follow thread on create when parent channel is followed | 待核对 P1           |
| `99fe3630` | 2026-06-15 20:54 | 含文件附件的 bot 消息不参与折叠分组                          | 待核对 P1           |
| `6ac0f936` | 2026-06-16 10:49 | sidebar quick-create 支持 scheduled updates                  | 待核对 P0           |
| `6aefa34c` | 2026-06-17 11:32 | 调整最近会话未读数字展示位置                                 | 待核对 P2           |
| `a812a307` | 2026-06-17 19:34 | production build 排除 vitest/storybook runtime               | 条件待搬 P1         |
| `b0ac8ec5` | 2026-06-17 23:47 | 父群 owner/admin 可在 channel settings 重命名 thread         | 待核对 P1           |
| `ac80160e` | 2026-06-17 23:49 | RELEASING.md 指向 org release process                        | 仓库 docs 不适用    |
| `160706b3` | 2026-06-18 00:14 | startMain 捕获 device-record fetch rejection                 | 待核对 P2           |
| `8f52022a` | 2026-06-18 00:16 | markdown cell output escape backslash before pipe            | 脚本待核对 P2       |
| `dbae7c5b` | 2026-06-18 00:16 | APIClient request timeout，避免登录页无限 spinner            | 待核对 P1           |
| `cfa2edbe` | 2026-06-18 00:18 | CONTRIBUTING / CODEOWNERS review policy                      | 仓库治理不适用      |
| `3ed5fea3` | 2026-06-18 00:49 | check-sprint workflow non-blocking                           | GitHub CI 不适用    |
| `594e375f` | 2026-06-18 00:58 | add channel search UI                                        | 待搬 P0             |
| `fa3f8dae` | 2026-06-18 00:59 | Dependabot code-review workflow                              | GitHub CI 不适用    |
| `dbeba59e` | 2026-06-18 07:58 | channel search 空输入不发 `_search` / `_search_all`          | 随 ChannelSearch 搬 |
| `68c0777e` | 2026-06-18 15:14 | extension sidepanel forward menu 支持 channel/subzone search | extension 不适用    |
| `199406c3` | 2026-06-18 16:26 | richtext:拒绝 broadcast sentinels + pasted mention UID 校验  | 待核对 P1           |
| `595d5973` | 2026-06-19 11:23 | 移除 deprecated friend apply reddot                          | 待核对 P2           |
| `3f3059ee` | 2026-06-19 11:38 | channel search UI polish                                     | 随 ChannelSearch 搬 |

## 关键观察

- `594e375f` 在当前老仓线性历史里是 **0 文件变更** commit；ChannelSearch 大量文件实际出现在前置 `a812a307` 中。记录 / 搬运时不要只看 `594e375f` 的 tree diff。
- 新仓未发现 `ChannelSearch` / `channel-search` 相关实现；但本批只覆盖 `a812a307` / `594e375f` / `dbeba59e` / `3f3059ee` 对应的主流程与早期 polish。
- 新仓 Summary 已有 `ChatSelectorModal`、schedule day/week/month、participants、CitationText 等基础；本批只核对 `1eaa7a0c` 和 `6ac0f936`。
- 新仓没有 `apps/extension` 业务目标；`68c0777e` 的 extension sidepanel 变更本批标记不适用。
- 老仓 `.github` / CODEOWNERS / CONTRIBUTING / RELEASING 仍属仓库治理项；新仓当前使用 GitLab/自有流程，不直接搬 GitHub Actions。

## Batch 3.1 — P0 Channel Search 基础

- [x] `a812a307` / `594e375f` ChannelSearch 主体
  - 新增频道 / 子区内搜索 UI。
  - 覆盖 all / message / media / file tabs、filter、sender / sort / date 控制。
  - 接入 search API adapter、thread panel entry、chat page entry。
  - 本仓落点建议: `src/features/chat/components/channel-search-*` + `src/features/base/api/endpoints/search.api.ts` 扩展。
  - 注意 `a812a307` 同时包含 production build 防测试代码入包；若本仓实现不使用旧 `require` glob 模式，build fix 可能不需要照搬。

- [x] `dbeba59e` 空输入保护
  - 空 keyword 不应触发 `_search` / `_search_all`。
  - media 查询按老仓语义允许 keyword omission 时需单独处理。

- [x] `3f3059ee` UI polish + file icon / pagination 抽取
  - 对照本仓 file-preview icon 体系，优先复用 `file-type-icon.tsx`。
  - 分页状态不要和 filter 状态互相污染。

实现说明:

- 新增 `ChannelSearchPanel`,通过 chat header 搜索按钮打开右侧互斥 panel。
- API 接入 `messages/_search_all` / `_search` / `_search_media` / `_search_files`,并复用本仓 file preview / locate message 能力。
- 对齐老仓 `messages_search_on` 远程开关:后端未下发 / 未开启时隐藏会话内搜索入口,避免接口未上线环境暴露 404。
- `vp lint` touched files 通过,`npx tsc -b` 通过;全仓 `vp check --fix` 被既有 `pdf-renderer.tsx` 裸 `useEffect` 阻塞。
- Browser 已用登录态验证聊天页:强制打开面板时 UI 正常、真实搜索请求当前环境返回 `Not Found`;确认 `/v1/common/appconfig` 未下发 `messages_search_on`,按老仓语义入口应隐藏。补 feature gate 后,测试环境仅保留左侧全局搜索入口,会话 header 搜索入口收起,控制台无 error。

> 后续说明:6 月 23 日之后的 ChannelSearch follow-up 已拆到 Batch 4;本次实现对其中部分前端能力做了兼容,但仍需等 Batch 4 解锁后按清单验收。

## Batch 3.2 — P0/P1 Summary

- [x] `1eaa7a0c` ChatSelector tabs
  - 对照新仓 `chat-selector-modal.tsx` 是否已有关注 / 最近 / 全部群聊 / 全部私聊。
  - 核对 tab 切换、默认选择、最大选择数、空态、搜索结果。

- [x] `6ac0f936` sidebar quick-create scheduled updates
  - 新仓 `chat-summary-new-modal.tsx` / `summary-create-workbench.tsx` 已有 schedule config 基础。
  - 需要确认从 sidebar quick-create 创建时是否能一次性带 schedule 参数。

实现说明:

- `ChatSelectorModal` tab 对齐为「关注 / 最近 / 全部群聊 / 全部私聊」,默认关注;关注 / 最近复用本仓 `/sidebar/sync` 查询体系,不新增后端接口。
- `ChatSummaryNewModal` 新增定时更新入口,复用 `ScheduleConfigModal`;创建总结成功后,若配置定时,用 `createSchedule({ scope:"task", task_id })` 原子绑定新 task,定时失败只 toast 不阻断总结创建。
- `npx tsc -b` 通过,touched files `vp lint ...` 通过。
- Browser 登录态验证:新建总结弹窗中可打开定时配置;聊天选择器显示四个目标 tab,默认关注列表。

> 后续说明:`690c1329` smart summary 多人协作 UI 已拆到 Batch 4。

## Batch 3.3 — P1/P2 Chat / Thread / Message 小修

- [x] `a109fe24` auto-follow thread on create
  - 父群已关注时,`ThreadListPanel` 顶部创建和消息右键创建子区都会 best-effort 调 `followThread`。
  - 判定来源用本仓 `sidebarFollowQueryOptions` / `sidebarFollowQueryKey` 派生的 `followedGroupNos` + `followedKeys`;父群未关注或子区已关注时不重复调用。
  - follow 失败仅 `console.warn`,不阻断子区创建 / 选中。

- [x] `99fe3630` bot file attachment 不参与 fold session
  - `fold-session.ts` 新增附件类型边界:image / gif / smallVideo / file / richText。
  - 含附件 bot 消息先 flush 当前 fold session,自身按普通消息渲染,保证交付物可见。
  - 新增 `fold-session.test.ts` 覆盖 `[文字,文字,文件,文字,文字]` 场景。

- [~] `6aefa34c` 最近会话未读数字位置
  - 新仓 `conversation-list.tsx` 已将未读数字渲染在第二行右侧(时间下方区域),不是头像 overlay。
  - 静音会话已显示灰色未读数字,而非红点;语义等价,本批无需额外搬 UI。

- [x] `b0ac8ec5` parent-group owner/admin rename thread
  - 新仓 `thread-permission.ts` 已从父群成员缓存判断 creator / owner / manager。
  - `channel-setting-modal.tsx` 已把 thread rename 与 archive 统一到 `canManageThread`,避免权限口径分裂。

- [~] `160706b3` device-record fetch rejection
  - 新仓未发现启动期 `/user/devices/{deviceId}` 或 `clientMsgDeviceId` 写入链路。
  - 本批判定不适用;若后续引入设备记录请求,需按 fail-open + warn 处理。

- [x] `dbae7c5b` API request timeout
  - `createClientOptions` 增加 20s 全局 `timeout`,覆盖主 api / matter client 共享拦截器。
  - 新增 request error toast;timeout / network error 本地化为 `api.error.timeout` / `api.error.network`。
  - 登录页 `extractSafeErrorMessage` 识别 transport error,避免 silent login 只显示通用错误。

- [x] `199406c3` richtext mention safety
  - `rich-text-paste.ts` 对 clipboard mention fail-closed:广播 sentinel(`-1/-2/-3/@all/all`)永远降级纯文本。
  - 普通 mention 只有在 UID 属于当前频道成员且 label 匹配 display label / alias 时才恢复为 mention node。
  - `composer.tsx` 将当前 subscribers 传入 paste restore;draft 恢复拒绝广播 sentinel laundering。
  - 新增 `rich-text-paste.test.ts` 覆盖合法成员 / forged UID / broadcast sentinel。

- [~] `595d5973` deprecated friend apply reddot
  - 新仓仅保留好友申请 API / 弹窗 / 文案,未发现 contacts nav badge 或 `/user/reddot/friendApply` 读取入口。
  - 本批判定不适用,无需 cleanup。

实现验证:

- `npx tsc -b` 通过。
- touched files `vp lint ...` 通过。
- `vp test run src/features/base/api/api-error.test.ts src/features/chat/lib/fold-session.test.ts src/features/chat/lib/rich-text-paste.test.ts` 通过,3 files / 8 tests。

> 后续说明:`6c379a18` raw HTML message、`5e945f52` compact online badge 已拆到 Batch 4。

## Batch 3.4 — 仓库治理 / 构建 / 脚本

- [~] `ac80160e` RELEASING.md
  - 老仓 release process 文档不直接适用于新仓；如需要，按本仓 GitLab/部署链路另写。

- [~] `cfa2edbe` CONTRIBUTING / CODEOWNERS
  - 新仓没有 `.github/CODEOWNERS` 工作流假设；暂不搬。

- [~] `3ed5fea3` / `fa3f8dae` GitHub Actions
  - GitHub workflow 不服务当前仓库流水线；不直接搬。

- [~] `8f52022a` i18n scan markdown table escape
  - 老仓修复对象是 `scripts/i18n-scan.mjs`;新仓未见同名 i18n scan / markdown report 脚本。
  - 新仓现有 `merge-upstream-locales.mjs` 不生成 markdown table;本批不适用。
  - 若后续引入老仓 i18n scan 输出 markdown 表格，需要同步 `escapeMarkdownCell(text).replace(/\\/g,"\\\\").replace(/\|/g,"\\|")` 规则。

- [~] `68c0777e` extension sidepanel forward menu
  - 新仓没有 extension app 目标；本批不搬。

## 验收策略

- 每个实现 MR 必须列出覆盖的 upstream SHA，且不得包含 Batch 4 SHA。
- “待核对”项必须给出新仓文件证据，不能只写“看起来已有”。
- 涉及 TanStack Query / Router / Form 的实现前按项目规则查 TanStack 文档。
- 代码迁移前至少跑:
  - `npx tsc -b`
  - `vp check`
  - 涉及 UI 时用 Browser 对桌面 / 窄屏做基础交互验证。
