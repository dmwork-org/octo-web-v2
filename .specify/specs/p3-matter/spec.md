# P3-matter Spec — 事项 feature MVP

> 单 session 独立完成,基于 main 起 `refactor/p3-matter` 分支。

## 目标(本 spec 范围)

把旧 `dmworktodo` 的事项(Matter)CRUD 主路径迁到新项目 `features/matter/`,跟 chat feature 同等级的"业务平行" P3 模块。

**只做 MVP**:列表(3 tab) + QuickAdd 创建 + 负责人编辑 + 状态切换 + 删除。**不做**详情面板的 timeline / comments / channel linking / smart extract / attachments — 这些留到 P3+ 单独迭代,不要堆在第一版。

## 范围(In Scope)

### 数据

- `MatterStatus` = "open" | "done" | "archived" 三态
- 列表分 3 tab:**我负责的** / **我创建的** / **全部**(per tab 用不同 query 参数,见 [api-mapping.md](./api-mapping.md))
- 列表项里再分**未归档** / **已归档**两段(已归档默认折叠,展开后显示)
- 游标分页(`cursor` + `has_more`,后端 keyset),滚到底加载更多

### 操作

- **QuickAdd**:输入框 + Enter 提交 → POST 创建 → 乐观或 invalidate → 出现在列表顶部
- **改状态**:open ↔ done(toggle)、archived 单独入口
- **编辑负责人**:从我可见的人里加 / 减 assignee(支持多个)
- **删除**:危险操作 confirm
- **打开详情**:左侧列表点选 → 右侧详情面板**展示**字段(title / description / DDL / status / assignees / creator) — 编辑限 P3+,本期详情面板只是"读"

### UI 结构

- 路由 `_auth/matter` — 已存在空壳,改成正式实现
- 左侧 ConversationSidebar 类型的窄边栏(280px)装列表 + tabs + QuickAdd
- 右侧主区装详情面板(选中时显示,未选时空状态提示"选个事项看看")
- 视觉走 `components/semi-bridge/` + Tailwind 默认,**不**单独再写 css 文件(对比旧 MatterPage.css 的 wk-mp-\* 类全部用 Tailwind 替代)

### 不做(P3+ 留)

> **注**:本节为 task-list 原始划界。设计稿 review 后由架构师裁定扩展 MVP,详见 [decisions.md](./decisions.md) D-4 — timeline / 主要目标编辑 / DDL pick 已加入本期范围,channel-picker / SmartCreateModal / AI 按钮(extractMatter) / ChatTodoPanel 仍 P3+。

- ❌ SmartCreateModal(从 IM 消息抽取生成 matter)— 强耦合 chat
- ❌ AI 按钮(extractMatter)— payload 含 chat msgs,跨 feature
- ❌ 关联群聊 / channel-picker — 强耦合 chat 群列表 UI
- ❌ ChatTodoPanel(chat 内联事项面板,跨 feature 集成)
- ❌ NavRail 入口的红点角标(per-tab unread)
- ❌ "我参与的"扩展 tab(只做 3 tab,跟原 PRD v0.7 §10 一致)
- ❌ timeline 按 channel 分组 / 附件上传 / @mention(等 channel-picker 一起做)

## 验收

- `pnpm check` 全绿,无 `any` / `useEffect+fetch`
- `pnpm structure-lint` 0 跨 feature import(matter 只能 import `features/base/*` 和 `components/*`)
- 手动走通 5 个核心场景:
  1. 进 `/matter`,看到 3 tab + 空状态(账号无 matter)
  2. QuickAdd 输入标题 → Enter → 列表立即出现 → 切到"我创建的" tab 看得到
  3. 点击 matter → 右侧详情显示 title / status / assignees(只读)
  4. 列表项右键 → 标完成 → 状态切到 done,刷新后保留
  5. 列表项右键 → 删除 → confirm → 列表移除,后端校验真删

## 旧项目源文件参考(只读,不改)

| 关注点                       | 旧项目路径                                                           | 备注                                                                         |
| ---------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| API 接口签名 + endpoint 路径 | `octo-web/packages/dmworktodo/src/api/todoApi.ts`                    | 309 行,逐个 endpoint 看                                                      |
| 类型定义                     | `octo-web/packages/dmworktodo/src/bridge/types.ts`                   | Matter / MatterDetail / 各种 Req 类型                                        |
| 主页 layout                  | `octo-web/packages/dmworktodo/src/pages/TodoPage.tsx`                | 289 行,看 3 tab + QuickAdd 结构,**不要照搬 Mitt / WKApp**                    |
| 列表 hook                    | `octo-web/packages/dmworktodo/src/hooks/useTodoList.ts`              | 分页 + 增删改本地同步,**重写**成 TanStack Query useInfiniteQuery + mutations |
| Sidebar 卡片 UI              | `octo-web/packages/dmworktodo/src/ui/SidebarCard/`                   | 视觉参考,Tailwind 重写                                                       |
| 详情面板                     | `octo-web/packages/dmworktodo/src/panel/MatterDetailPanel/index.tsx` | 2236 行!**本期只取字段展示部分,timeline / 评论等全部跳过**                   |

## 新项目集成点(必须遵守)

| 要做的事     | 怎么做                                                                                                                        |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| HTTP 请求    | `import { api } from "@/features/base/api/client"` — 别用 axios                                                               |
| 当前 spaceId | `useStore(spaceStore, s => s.spaceId)` — `features/base/stores/space.ts`                                                      |
| 当前 uid     | `useStore(authStore, s => s.user?.uid ?? "")` — `features/base/stores/auth.ts`                                                |
| Query        | `queryOptions` 工厂 + route loader `ensureQueryData` + 组件 `useSuspenseQuery` / `useQuery`                                   |
| Mutation     | `useMutation` + onSuccess `invalidateQueries`,参考 `features/chat/components/conversation-list.tsx` 的 `unfollowMu`           |
| Modal        | `features/base/components/modals/` 的 `ConfirmModal` / `InputModal`                                                           |
| Toast        | `import { toast } from "@/components/semi-bridge/toast"`                                                                      |
| 头像         | 用户头像 `<ChannelAvatar channel={new Channel(uid, ChannelTypePerson)} />`,参考 `features/chat/components/channel-avatar.tsx` |
| 用户名       | 写个 `UserName` 小组件,内部 `WKSDK.shared().channelManager.getChannelInfo(new Channel(uid, ChannelTypePerson))` + fetch 兜底  |
| 路由         | file-based,改 `src/routes/_auth.matter.tsx`(已有 7 行 placeholder),loader 拉首屏列表                                          |

## 工作流约束

- 每个改动前 hook 都会跑 `vp check` — 编辑被 block 时按提示修,**别绕开**
- skill 自动注入(matters 触发 `implement-mutation-with-invalidate` / `implement-typed-search-params` 等),按 SKILL.md 范本写
- 写 TanStack 代码前 `tanstack doc <topic>` 查文档(CLAUDE.md 第 5 条)
- 走 7 步方法论:**不要**跳过结构 lint / eval / taste 验证
- 单个 commit 跑通一个子功能,别一个大 commit 包圆

## 提交建议

按 [task-list.md](./task-list.md) 顺序,每完成一组 task 开一个 commit + push;全部完成后开 MR 回 main。

## 起点

```bash
git fetch origin && git checkout -b refactor/p3-matter origin/main
```

读完 spec → 读 [api-mapping.md](./api-mapping.md) → 按 [task-list.md](./task-list.md) 顺序 `TaskCreate` 跟踪。
