# P3-contacts 任务列表

> 按顺序做,一组一个 commit。session 启动后 `TaskCreate` 跟踪进度。
> **节奏跟 P3-matter 显著不同** — matter 是"从零迁移",contacts 是"**审计 + 补差 + 完善**"(现有 1486 行已基本现代化,从 commit 0 audit 起步)。

## 0. 起点确认 + audit 报告(commit 0)

**起点确认**(无 commit):

- [ ] `git status` 在 worktree 干净
- [ ] 当前分支 `refactor/p3-contacts`
- [ ] `pnpm install` 已跑(worktree 共享依赖,通常不需要)
- [ ] `pnpm dev` 跑得起来,登录走通,`/contacts` 能进

**commit 0**(`chore(contacts): audit report — 现有代码 vs 旧 dmworkcontacts 对位`):

产出 `.specify/specs/p3-contacts/audit.md`,**不动代码**。模板:

```md
# contacts feature audit — 现有代码对位旧 dmworkcontacts

## 模块对位

| 旧模块 | 新组件 | 状态 | 差距 / 行动 |
| --- | --- | --- | --- |
| Contacts/index.tsx | components/contacts-directory.tsx | ✅ 实现 | 拼音 `#` 边界硬编码(commit 2) |
| FriendAdd/* | components/friend-add.tsx | ⚠️ 部分 | vercode 校验链路待验(commit 5) |
| NewFriend/* | components/friend-applies.tsx | ✅ 实现 | 红点 verify |
| Blacklist/* | components/blacklist.tsx | ✅ 实现 | — |
| GroupSave/* | components/saved-groups.tsx | ✅ 实现 | — |
| Organizational/* | (无) | ❌ 未做 | **P3+ 留** |
| Service/* | TanStack Query invalidate 替代 | ✅ 等价 | — |
| api/* | api/{friends,friend-applies}.api.ts | ✅ 实现 | endpoint path 逐条校对 |

## 基线指标(commit 0 落笔时)

- `pnpm check`:0 errors / N warnings
- `pnpm structure-lint`:M 个 contacts → chat 引用(待 commit 7 加白名单)
- `find src/features/contacts -name '*.ts' -o -name '*.tsx' | xargs wc -l` 总行数:1486

## endpoint path 校对(逐条勾选)

| Endpoint | 旧调用点 | 新 api 文件 | 一致? |
| --- | --- | --- | --- |
| POST /v1/friend/sync | ? | friends.api.ts | ☐ |
| GET /v1/friend/search | FriendAdd/vm | friends.api.ts | ☐ |
| ...(8 个 endpoint 逐条) | | | |

## 违规项(待修)

- [ ] `views/contacts.view.tsx:41` `useState<SubPage>` 存 URL state(commit 3 修)
- [ ] `friend-list.tsx` / `contacts-directory.tsx` 拼音分组硬编码(commit 2 修)
- [ ] `_auth.contacts.tsx` 缺 loader(commit 4 修)
- [ ] query factory 缺 staleTime + invalidate 链(commit 1 修)
- [ ] `friend-add.tsx` vercode 校验未验证(commit 5 修)

## 拼音工具基建去向

- [ ] `features/base/lib/pinyin-bucket` 是否存在?
  - 存在 → commit 2 直接接
  - 不存在 → commit 2 抽到 `features/contacts/lib/pinyin-bucket.ts`(本期 contacts-local,等 summary 用到再上升 base)
```

**验收**:audit.md 落地,跟主架构师确认 audit 结果后再开 commit 1。

## 1. Query factory 规范化(commit 1)

`refactor(contacts): query factory 规范化(staleTime + invalidate 链)`

- [ ] 读 `features/chat/queries/*` 看 query factory 风格(staleTime 取值 / queryKey 命名)
- [ ] `features/contacts/queries/{friends,directory}.query.ts` 补齐:
  - 每个 `queryOptions` 加 `staleTime`(参考 chat 风格)
  - 每个 mutation 在注释里列 onSuccess 该 invalidate 哪几个 queryKey
- [ ] `features/contacts/mutations/` 若不存在则建,从 components 里抽 mutation 集中放(若 components 内联了 useMutation 不必硬抽,审 commit 1 时定)
- [ ] 触发 `implement-mutation-with-invalidate` skill,按 SKILL.md 范本写

**验收**:`pnpm check` 全绿;query key 命名跟 chat feature 一致风格(`["contacts", "friends", spaceId]` 之类)。

## 2. 拼音分组接基建(commit 2)

`feat(contacts): 拼音分组接 base/lib/pinyin-bucket`

按 commit 0 audit 决策走两个分支:

**分支 A**:`features/base/lib/pinyin-bucket` 已存在
- [ ] `friend-list.tsx` 改用 `bucketByPinyin(items, item => item.name)` 类似 API
- [ ] `contacts-directory.tsx` 同改

**分支 B**:不存在
- [ ] 建 `features/contacts/lib/pinyin-bucket.ts`,抽出当前 friend-list 内部逻辑
- [ ] 加测试(本期单元测试不强求,但导出函数有清晰类型)
- [ ] friend-list / contacts-directory 改用本地工具
- [ ] 在 `decisions.md` 记 "拼音工具本期 contacts-local,等 summary feature 用到再上升 `features/base/lib/`"

**验收**:directory 拼音分组覆盖中英文混(陈 / 张 / Alice / `#` 桶 都对);`pnpm check` 全绿。

## 3. sub-page URL state(commit 3)

`feat(contacts): sub-page 改 URL state(?sub=...)`

- [ ] 触发 `implement-typed-search-params` skill
- [ ] `src/routes/_auth.contacts.tsx` 加 `validateSearch`:
  ```ts
  const ContactsSearch = z.object({
    sub: z.enum(["directory", "applies", "add", "blacklist", "saved-groups"]).default("directory"),
  });
  ```
- [ ] `views/contacts.view.tsx`:
  - 删 `useState<SubPage>`(line 41)
  - 改用 `Route.useSearch()` 读 sub
  - 顶部 4 个 icon onClick 改 `navigate({ search: prev => ({ ...prev, sub: 'applies' }) })`
  - 返回按钮同改 `navigate({ search: prev => ({ ...prev, sub: 'directory' }) })`(或直接 omit sub)
- [ ] PAGE_TITLE 映射保留

**验收**:
- `/contacts?sub=blacklist` 直达进黑名单
- 刷新保留 sub
- 浏览器后退 / 前进 切换 sub
- 进入未知 sub 值(`?sub=foo`)被 zod 拦下,默认回 directory

## 4. 路由 loader + ensureQueryData 预热(commit 4)

`feat(contacts): 路由 loader + ensureQueryData 预热 directory`

- [ ] 触发 `implement-route-with-query-loader` skill
- [ ] `src/routes/_auth.contacts.tsx` 加 loader:
  ```ts
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(spaceMembersQueryOptions(spaceId)),
      context.queryClient.ensureQueryData(myBotsQueryOptions()),
      context.queryClient.ensureQueryData(spaceBotsQueryOptions(spaceId)),
      context.queryClient.ensureQueryData(myGroupsQueryOptions()),
    ]),
  ```
  - spaceId 从 `spaceStore` 读(loader 上下文怎么拿 spaceId,参考 chat feature loader 写法)
- [ ] `contacts-directory.tsx` 改 `useQuery` → `useSuspenseQuery`(因为 loader 已保证数据有)
- [ ] 首屏不再 spinner,直接出列表

**验收**:`/contacts` 首屏无 loading 闪烁;DevTools Network 看 4 个 query 在 component mount 前已发起。

## 5. friend-add vercode 校验链路(commit 5)

`fix(contacts): friend-add vercode 校验链路`

按 commit 0 audit 结论走:

- 不需要前端预校验 → 本 commit 跳过,audit.md 标 ✅ 关闭
- 需要前端预校验 → 在 `friend-add.tsx` 加 zod 校验 / 表单错误展示

**验收**:加好友走通 — 搜索结果点"加" → 弹 vercode 输入(若有)→ 提交后端 → toast 成功 / 失败按后端错误展示。

## 6. 视觉 + 交互细节对齐(commit 6)

`feat(contacts): 视觉 + 交互细节对齐(对照旧 dmworkcontacts)`

对照旧 `dmworkcontacts/Contacts/index.tsx` 视觉调整(若 commit 0 audit 中发现差距),IC 自查 + 抽样手测。**改动较大** → 拆子 commit 不混合。

可能项:
- 手风琴 default open 状态
- 头像尺寸 / 间距
- 搜索框 placeholder 文案
- 空状态文案 / 插图

**验收**:6 条手动场景的视觉部分主观达标;`pnpm check` 全绿。

## 7. structure-lint 白名单(commit 7)

`chore(structure-lint): contacts → chat 白名单 + 注释 P4+ 解`

- [ ] 读 `scripts/structure-lint.ts`,理解当前白名单结构
- [ ] 加 3 条 contacts → chat 白名单:
  ```ts
  { from: 'features/contacts', to: 'features/chat/components/channel-avatar', reason: 'UI 通用,P4+ 抽 features/base' },
  { from: 'features/contacts', to: 'features/chat/components/chat-main', reason: '右栏沿用现状,P4+ 做通讯录详情面板时解' },
  { from: 'features/contacts', to: 'features/chat/stores/chatSelectedStore', reason: '点联系人开对话,P4+ 解' },
  ```
  (具体 path 形态以 structure-lint 当前格式为准)
- [ ] 跑 `pnpm structure-lint` 全绿

**验收**:`pnpm structure-lint` 0 violations;白名单条目带注释说明 P4+ 解。

## 8. 收尾(commit 8)

`chore(contacts): decisions.md 续写 + spec 同步 + final lint`

- [ ] 起 `.specify/specs/p3-contacts/decisions.md`,把实施期发现的真决策(若有)记 D-1 / D-2 / ...(沿用 matter decisions.md 风格)
  - 如果实施期没碰到真决策(只是按 spec 执行),decisions.md 写"本期实施按 spec 执行,无重大决策反转;沿用 P3-matter D-1 ~ D-4 原则"即可
- [ ] 同步 spec.md / api-mapping.md / task-list.md 到真实状况(若实施期发现 spec 描述跟现实有偏差)
- [ ] 若 `features/contacts/MANIFEST.md` 不存在,补写(参 `features/matter/MANIFEST.md` 模板)
- [ ] 跑 `pnpm check && pnpm structure-lint`,全绿
- [ ] 跑 `pnpm eval`(如果项目里有脚本),关注 contacts feature eval 不能减分
- [ ] 走一遍 [spec.md](./spec.md) 的 6 条手动验收 — 全过才推 MR
- [ ] `git push -u origin refactor/p3-contacts`
- [ ] 开 MR 回 main(GitLab MR 模板),body 贴本 spec 链接 + 6 条验收勾选

## 进度跟踪建议

启动时 `TaskCreate` 把本文件的 9 个 section(commit 0~8)各建 1 个 task,subject 用 commit 编号 + 简述,描述里贴 section 的具体 checklist。每完成一个 commit 把 task 标 completed。

## 跟 P3-matter task-list 的差异点(给 IC 看)

| 维度 | P3-matter | P3-contacts |
| --- | --- | --- |
| 起步状态 | 缺基建 + 部分实现 + 有超范围代码 | 1486 行已基本现代化,endpoint 已对位 |
| commit 0 | `chore: remove out-of-scope` | `chore: audit report` |
| 核心难点 | 抽公共 interceptor / 建独立 client / 写 8 endpoint | 修 useState 违规 + 接拼音基建 + 加 loader |
| 是否新建 client | 是(`/matter/api/v1` 独立部署) | 否(复用 IM 主 client) |
| 跨 feature 耦合 | 0(matter 完全独立) | 3(继承现有 chat 引用,白名单标 P4+ 解) |
| 视觉对齐 | 设计稿驱动(D-4 扩 MVP) | 对照旧 dmworkcontacts 微调 |

IC 进 session 第一件事:**别按 matter task-list 节奏来**,先把 commit 0 audit 跑完,跟主架构师确认后再继续。
