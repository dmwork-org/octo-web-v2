# P3-matter 任务列表

> 按顺序做,一组一个 commit。session 启动后 `TaskCreate` 跟踪进度。

## 0. 起点确认(无 commit)

- [ ] `git status` 在 worktree 干净
- [ ] 当前分支 `refactor/p3-matter`
- [ ] `pnpm install` 已跑(worktree 共享依赖,通常不需要)
- [ ] `pnpm dev` 跑得起来,登录走通

## 1. 类型 + API 端点(commit 1)

- [ ] 建 `src/features/matter/types.ts` — 拷贝 [api-mapping.md](./api-mapping.md) 的精简类型
- [ ] 建 `src/features/base/api/clients/matter-client.ts` — ofetch 实例,baseURL=`/matter/api/v1`,拦截器复用 `features/base/api/client.ts` 的 5 个(把它们抽出来共享)
   - 如果当前 `client.ts` 没把拦截器抽公共,先 refactor 抽出来再建第二个 client
- [ ] 建 `src/features/base/api/endpoints/matter.api.ts` — 8 个 endpoint(listMatters / getMatter / createMatter / updateMatter / transitionMatter / deleteMatter / addAssignee / removeAssignee)

**验收**:`pnpm check` 全绿。

## 2. Query / Mutation 工厂(commit 2)

- [ ] 建 `src/features/matter/queries/matters.query.ts`:
  - `mattersListQueryKey(spaceId, params)`
  - `mattersListInfiniteQueryOptions(spaceId, params)` — useInfiniteQuery 配 cursor 分页
  - `matterDetailQueryKey(id)`
  - `matterDetailQueryOptions(id)` — 单条详情
- [ ] 建 `src/features/matter/mutations/matters.mutations.ts` 或就在组件里 inline 也可:
  - createMatter / updateMatter / transitionMatter / deleteMatter / addAssignee / removeAssignee
  - 每个 onSuccess 至少 `invalidate(mattersListQueryKey)`,改单条还要 `setQueryData(matterDetailQueryKey)`

**验收**:`pnpm check` 全绿,query key 命名跟 chat feature 一致风格(`["matter", "list", spaceId, paramsHash]` 之类)。

## 3. UserName 小组件(commit 3)

放 `src/features/matter/components/user-name.tsx`(列表 / 详情多处用):

- [ ] 入参 `{ uid: string }`,内部 `WKSDK.shared().channelManager.getChannelInfo(new Channel(uid, ChannelTypePerson))`
- [ ] 缓存里没有时主动 `fetchChannelInfo`,异步拉到后用 `useStore` 或 channelInfoListener 重渲(参考 `features/chat/components/channel-avatar.tsx` 的写法)
- [ ] fallback:显示 uid

**验收**:在 `_dev/examples/` 路由下挂一个 demo,贴 5 个真实 uid 看到名字。

## 4. SidebarCard 列表项(commit 4)

`src/features/matter/components/sidebar-card.tsx`:

- [ ] 入参 `{ matter: Matter, selected: boolean, onClick }`
- [ ] 渲染:
  - M-序号 + 状态徽章(open=蓝 / done=绿 / archived=灰)
  - DDL(如果有):红色字提示,小图标
  - title(font-semibold,truncate)
  - creator(头像 + UserName)+ source_name(小字)
  - assignees:多个头像叠
- [ ] selected 时高亮 bg-brand-tint
- [ ] 旧 `dmworktodo/src/ui/SidebarCard/` 视觉做参考,Tailwind 重写

**验收**:demo 路由下贴 mock 数据,看 5 种状态组合都对(有/无 DDL × 有/无 assignees × 各 status)。

## 5. QuickAdd 输入(commit 5)

`src/features/matter/components/quick-add.tsx`:

- [ ] 单行 input,placeholder "添加事项,Enter 提交"
- [ ] Enter 提交,调 createMatter mutation
- [ ] 提交中 disabled
- [ ] 成功后清空输入,toast.success
- [ ] 失败 toast.error

**验收**:接到列表上能新增,空白标题不发请求。

## 6. Tabs + 列表 + 归档折叠(commit 6)

`src/features/matter/components/matter-list.tsx`:

- [ ] 3 tab:mine / created / all,切 tab 重置 selectedId
- [ ] 每 tab 一个 useInfiniteQuery,query key 含 tab + spaceId
- [ ] tab 计数:本 tab 列表项数(loaded 数,不是后端 total)
- [ ] 列表内分两段:
  - **未归档** segment:`status !== "archived"`
  - **已归档** segment:`status === "archived"`,默认折叠,点击展开
- [ ] 触底加载更多(IntersectionObserver 或 sentinel 元素)
- [ ] 空状态文案

**验收**:3 tab 切来切去顺畅,加载更多正常。

## 7. 详情面板(只读版)(commit 7)

`src/features/matter/components/matter-detail-panel.tsx`:

- [ ] 入参 `{ matterId: string, onClose }`
- [ ] useSuspenseQuery 拉单条 detail
- [ ] 顶栏:title + close 按钮
- [ ] 内容区只读展示:
  - title
  - status 徽章
  - DDL(格式化时间)
  - description
  - creator + 创建时间
  - assignees 列表
- [ ] 操作区(右上角 ⋯ 菜单):
  - 标完成 / 重新打开(toggle status)
  - 归档(单独入口)
  - 编辑负责人(点开弹 InputModal 或自己做个简版 picker:列出我可见的人 + 复选)
  - 删除(danger,confirm)

**验收**:5 个操作各跑一次,刷新后保留。

## 8. 路由整合(commit 8)

修 `src/routes/_auth.matter.tsx`(已有 7 行):

- [ ] loader:首屏 `ensureQueryData(mattersListInfiniteQueryOptions(spaceId, {assignee_id: myUid}))` 预热"我负责的"tab
- [ ] 组件:左 280px sidebar(MatterList),右 1fr(MatterDetailPanel 或空状态)
- [ ] 选中状态:用 `useSearch` URL state 存 selectedId(刷新保留)
- [ ] 触发 `implement-typed-search-params` skill,按它的范本写 `validateSearch`

**验收**:打开 `/matter` 能看到列表 + 创建 + 选详情 + 改状态 + 删除全跑通,URL 上有 `?id=...`,刷新保留选中。

## 9. 收尾(commit 9 或合到 commit 8)

- [ ] 跑 `pnpm check && pnpm structure-lint`,全绿
- [ ] 跑 `pnpm eval`(如果项目里有脚本),关注新增 feature 的 eval 不能减分
- [ ] 走一遍 [spec.md](./spec.md) 的 5 条手动验收
- [ ] `git push -u origin refactor/p3-matter`
- [ ] 开 MR 回 main(用 GitLab MR 模板),body 贴本 spec 链接 + 5 条验收勾选

## 进度跟踪建议

启动时 `TaskCreate` 把本文件的 9 个 section 各建 1 个 task,subject 用 commit 编号 + 简述,描述里贴 section 的具体 checklist。每完成一个 commit 把 task 标 completed。
