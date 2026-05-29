# P3-contacts Spec — 通讯录 feature 审计 + 补差

> 单 session 独立完成,基于 main 起 `refactor/p3-contacts` 分支。

## 目标(本 spec 范围)

把 `src/features/contacts/` 现有 1486 行从"基建对、功能跑得通"提升到 P3 验收标准。

**跟 P3-matter 起步状态本质不同** — matter 当时缺基建 + 要反转 endpoint 位置(D-2)+ 删超范围(D-3)+ 设计稿扩 MVP(D-4)。contacts 反过来,起步即基本现代化(ofetch / TanStack Query v5 / file route / shadcn / 0 `any`,endpoint 已按 D-2 正确分布)。所以本期节奏是 **审计 → 补差 → 完善**,**不是**从零迁移。

只做 MVP。审计已实现部分 + 修齐违规(useState 存 sub-page state)+ 接基建(拼音分组)+ 路由 loader 预热。**不做**企业组织树 / 右栏 ChatMain 解耦 / 联系人详情字段编辑 — 留 P3+ / P4+ 单独迭代。

## 范围(In Scope)

### 审计已实现(只校验,不重写)

| 组件        | 文件                                   | 行数 | 主要职责                                                                        |
| ----------- | -------------------------------------- | ---- | ------------------------------------------------------------------------------- |
| 主视图      | `views/contacts.view.tsx`              | 125  | 3 列 layout(中:directory / 子页,右:`<ChatMain />`)+ 4 顶部入口                  |
| 主目录      | `components/contacts-directory.tsx`    | 495  | 3 段手风琴(群聊 / 已添加 AI / 全部联系人)+ 拼音分组 + 搜索                      |
| 好友列表    | `components/friend-list.tsx`           | 153  | 首字分组 + 搜索(给 directory 内部段消费)                                        |
| 新朋友      | `components/friend-applies.tsx`        | 130  | 申请列表 + 接受 / 删除 / 清红点                                                 |
| 加好友      | `components/friend-add.tsx`            | 130  | 搜索 + 发申请                                                                   |
| 黑名单      | `components/blacklist.tsx`             | 66   | 黑名单列表 + 加 / 移除                                                          |
| 保存的群    | `components/saved-groups.tsx`          | 84   | 我的群聊列表                                                                    |
| AI 推荐入口 | `components/botfather-banner.tsx`      | 33   | BotFather 推荐卡                                                                |
| API         | `api/{friends,friend-applies}.api.ts`  | 122  | 8 个 friend / friend-apply / reddot endpoint                                    |
| Query       | `queries/{friends,directory}.query.ts` | 75   | queryOptions 工厂(spaceMembers / myBots / spaceBots / myGroups / friendApplies) |
| Types       | `types/{friend,friend-apply}.types.ts` | 59   | Friend / FriendApply 接口                                                       |

**审计任务**(commit 0):对照旧 `dmworkcontacts` 8 模块,产出 `audit.md`,标 **✅ 已实现 / ⚠️ 部分 / ❌ 未做** 三态 + 行动项。详见 [task-list.md](./task-list.md) commit 0。

### 补差(按 commit 0 审计报告)

- **sub-page state 改 URL state**:`views/contacts.view.tsx:41` 当前用 `useState<SubPage>` 切换 5 个子页(directory / applies / add / blacklist / saved-groups)— 违 CLAUDE.md "useState 不存 URL 状态" 禁令。改成 `?sub=...` + zod `validateSearch`,触发 [`implement-typed-search-params`](../../../.claude/skills/implement-typed-search-params/) skill。
- **拼音分组接基建**:`friend-list.tsx` / `contacts-directory.tsx` 内有简化版分桶(`#` 边界硬编码),改用 `features/base/lib/pinyin-bucket`(若已存在;若不存在则本 commit 顺手抽出来,作为本期 contacts 内部工具,等 summary feature 用到再上升 base)
- **query 工厂规范化**:对齐 `features/chat/queries/` 风格,补 `staleTime` + invalidate 链(每个 mutation onSuccess 列出该 invalidate 哪几个 queryKey)
- **路由 loader + ensureQueryData**:`src/routes/_auth.contacts.tsx` 加 loader 预热 directory 首屏 4 个 query(spaceMembers / myBots / spaceBots / myGroups),触发 [`implement-route-with-query-loader`](../../../.claude/skills/implement-route-with-query-loader/) skill
- **friend-add vercode 校验**:Explore 报告标"未验证",commit 0 audit 阶段确认是否需要前端预校验,需要则 commit 5 补

### 视觉 / 交互细节

对照旧 `dmworkcontacts/Contacts/index.tsx`(480+ 行)+ 当前设计稿(如有)调整组件细节。若与旧版差距大走"扩展 MVP"路径,在 `decisions.md` 记 D-1(沿用 matter D-4 经验:用"跨 feature 耦合"判断是否扩,而非"功能完整度")。

### 不做(P3+ 留)

- ❌ **Organizational(企业组织树)** — 旧 `dmworkcontacts/src/Organizational/` 存在,业务侧未明确仍需,等需求确认再做
- ❌ **解耦右栏 `<ChatMain />`** — 当前 `views/contacts.view.tsx:122` 已直接挂 chat 主容器,**不是本期新建的耦合**。P4+ 做"通讯录详情面板"时一并解。`scripts/structure-lint.ts` 加 3 条白名单(`ChannelAvatar` / `ChatMain` / `chatSelectedActions`)+ 注释 "P4+ 解"。
- ❌ 联系人详情字段编辑(改备注 / 群信息编辑等)— 强耦合 chat 写路径
- ❌ 子区(thread)列表入口 — 属 chat 域
- ❌ 联系人导出 / 批量操作 / 标签管理 — 旧项目无,新需求未提

## 验收

- `pnpm check` 全绿,0 `any` / `useEffect+fetch` / 裸 component useEffect
- `pnpm structure-lint` 全绿(contacts → chat 3 引用在白名单内,带注释)
- URL 状态:`/contacts?sub=blacklist` 直达 + 刷新保留 + 链接可分享
- 6 条手动场景:
  1. 进 `/contacts` 默认 directory,看到 4 顶部入口(新朋友 / 加好友 / 黑名单 / 保存的群)+ 3 段手风琴(群聊 / AI / 全部联系人)
  2. URL `?sub=applies` 直达 + 刷新保留;返回回到 `?sub=directory`(或省略 sub)
  3. 加好友:搜索关键词 → 出搜索结果 → 发申请 → toast 成功 → 对方接受后 directory 出现
  4. 黑名单:加 → directory 不再可见;移除 → directory 重新出现
  5. 保存的群:点群 → 右栏 `<ChatMain />` 进群对话
  6. directory 拼音分组覆盖中英文混(陈 / 张 / Alice / # 桶 都对)

## 旧项目源文件参考(只读,不改)

| 关注点                         | 旧项目路径                                                      | 备注                                                           |
| ------------------------------ | --------------------------------------------------------------- | -------------------------------------------------------------- |
| 主目录(虚拟列表 + 拼音 + 3 段) | `octo-web/packages/dmworkcontacts/src/Contacts/index.tsx`       | 480+ 行,视觉参考,**不**照搬 `WKApp.dataSource.contactsSync`    |
| FriendAdd 搜索                 | `octo-web/packages/dmworkcontacts/src/FriendAdd/`               | 验 vercode 校验链路                                            |
| NewFriend 申请                 | `octo-web/packages/dmworkcontacts/src/NewFriend/{vm,index}.tsx` | 验红点 / 接受流程                                              |
| GroupSave 保存群               | `octo-web/packages/dmworkcontacts/src/GroupSave/vm.tsx`         | 视觉参考,query 已落 `features/base/api/endpoints/group.api.ts` |
| Service 刷新事件               | `octo-web/packages/dmworkcontacts/src/Service/`                 | 旧 `ContactsListManager`,新版用 query `invalidate` 替代        |
| Organizational(企业组织)       | `octo-web/packages/dmworkcontacts/src/Organizational/`          | **本期跳过**,P3+ 评估                                          |
| API 调用聚合                   | `octo-web/packages/dmworkcontacts/src/api/`                     | 旧只放 AgentCard types,api 调用散在各 vm                       |

## 新项目集成点(必须遵守)

| 要做的事     | 怎么做                                                                                                                                               |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| HTTP 请求    | `import { api } from "@/features/base/api/client"` — 复用 IM 主 client(`/v1/` baseURL + 5 拦截器),**不**像 matter 建独立 client                      |
| 当前 spaceId | `useStore(spaceStore, s => s.spaceId)` — `features/base/stores/space.ts`                                                                             |
| 当前 uid     | `useStore(authStore, s => s.user?.uid ?? "")` — `features/base/stores/auth.ts`                                                                       |
| Query        | `queryOptions` 工厂 + route loader `ensureQueryData` + 组件 `useSuspenseQuery` / `useQuery`                                                          |
| Mutation     | `useMutation` + onSuccess `invalidateQueries`,参考 `features/chat/components/conversation-list.tsx` 的 `unfollowMu` 风格                             |
| URL state    | **本期重点** — `implement-typed-search-params` skill:zod `validateSearch` + `Route.useSearch()` + `navigate({ search: prev => ({ ...prev, sub }) })` |
| 路由 loader  | **本期重点** — `implement-route-with-query-loader` skill:`loader: ({ context }) => Promise.all([ensureQueryData(...), ensureQueryData(...)])`        |
| Modal        | `features/base/components/modals/` 的 `ConfirmModal` / `InputModal` / `UserInfoModal` / `GroupCardModal` / `BotDetailModal`                          |
| Toast        | `import { toast } from "@/components/semi-bridge/toast"`                                                                                             |
| 头像         | `<ChannelAvatar channel={new Channel(uid, ChannelTypePerson)} />`,**沿用 chat feature 的** `features/chat/components/channel-avatar.tsx`(白名单已加) |
| 用户名       | `features/matter/components/user-name.tsx`(matter 已实现,本期顺手抽到 `features/base/components/` 或保持 matter-local 视情况;commit 8 收尾时定)      |
| 路由         | file-based,改 `src/routes/_auth.contacts.tsx`(已存在),loader 拉首屏 + `validateSearch` 接 sub URL state                                              |

## 工作流约束

- 每个改动前 hook 都会跑 `vp check` — 编辑被 block 时按提示修,**别绕开**(`--no-verify` / 重命名 / MultiEdit 都不行)
- skill 自动注入按 `paths:` 匹配,paths 匹配不上手动 `/<skill-name>` 触发;skill 内 SKILL.md 范本是真实代码,直接照写
- 写 TanStack 代码前 **必须** `tanstack doc <topic>` 或 `tanstack search-docs "<keyword>"`(CLAUDE.md 第 5 条)
- 走 7 步方法论:**不要**跳过结构 lint / eval / taste 验证
- 单个 commit 跑通一个子功能,**别**一个大 commit 包圆
- 改动越出 spec 范围 → 停手回主 session,**不要**自作主张扩范围(参 P3-matter D-4 经验:用户提供新设计稿后才扩 MVP)
- 沿用 P3-matter 的"实施期续写 decisions.md"模式 — 本 spec 不预建 decisions.md,IC 真碰到决策再起

## 提交建议

按 [task-list.md](./task-list.md) 顺序,每完成一组 task 一个 commit + push;全部完成后开 MR 回 main,body 贴本 spec 链接 + 6 条验收勾选。

## 起点

```bash
git fetch origin && git checkout -b refactor/p3-contacts origin/main
```

读完 spec → 读 [api-mapping.md](./api-mapping.md) → 读 `.specify/specs/p3-matter/decisions.md`(继承 D-1 ~ D-4 原则)→ 按 [task-list.md](./task-list.md) 顺序 `TaskCreate` 跟踪,**从 commit 0 audit 起步**。
