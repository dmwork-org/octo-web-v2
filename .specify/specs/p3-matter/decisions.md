# P3-matter 实施决策记录

> IC 实施 P3-matter feature 期间从架构师收到的关键决策,以及对 [`task-list.md`](./task-list.md) /
> [`api-mapping.md`](./api-mapping.md) 的反向修订。后续 feature(contacts /
> summary / appbot)的 spec 可参照本记录的"业务封装"原则。

## D-1 现有代码处理:增量改造,不推倒重写

**背景**:启动 P3-matter session 前,`src/features/matter/` 已经存在一份初版实现(MatterView + 7 components + types/api/queries),与 task-list 假定的"从零起步"不一致。

**决策**:**增量改造** — 留可用部分(types / queries / status-badge / assignee-picker / 顶层布局),按 task-list 缺口补差,改不一致的,拆 commit 体现演进。

**理由**:

- 推倒重写浪费已有成果(尤其 assignee-picker 旧版完整度高,直接复用)
- 保留现状不做规范化又跟 spec 不一致
- 增量改造每 commit 主题清晰,出问题易定位 / git revert

## D-2 endpoints 位置:**反转 task-list**,保留 `features/matter/api/`

**背景**:`task-list.md` §1 原写"建 `src/features/base/api/endpoints/matter.api.ts`",依照 chat / message / channel 等 14 个 endpoint 都在 `features/base/api/endpoints/` 的现状。

**决策**:**反转** — endpoints 留在 `features/matter/api/`,**不**迁到 `features/base/api/endpoints/`。

**理由**:

- 已有 `features/base/api/endpoints/*.api.ts`(channel / conversation / group / message / sidebar / user / ...)全部是 **IM 域共享**、多个 feature 都消费的端点
- matter 是**独立业务域**(`/matter/api/v1` 独立服务,后端独立部署),只 matter feature 自己用 — feature-local 才符合"业务封装"原则
- 把它放进 `features/base/api/endpoints/matter.api.ts` 反而把业务 API 污染到基建层
- 未来 contacts / summary / appbot 各自有业务 API 都进 base,base 会膨胀失控

**对 [`task-list.md`](./task-list.md) §1 / [`api-mapping.md`](./api-mapping.md) 表头的修订**:把"endpoint 位置"统一改到 `features/matter/api/matter.api.ts`(已在本 commit 顺手改完,不单独开 MR)。

**模板原则**(供后续 feature 参考):

- 跨 feature 共享 + IM 域共消费的 endpoint → `features/base/api/endpoints/*.api.ts`
- 单 feature 独立业务域(独立后端服务 / 独立 baseURL)→ `features/<feature>/api/*.api.ts`

## D-3 超范围组件:删除并单独 commit

**背景**:现有实现包含 `timeline-section.tsx` / `channel-picker.tsx` / 相关 timeline + channel API,但 [`spec.md`](./spec.md) §"不做(P3+ 留)"明确划界这些是 P3+ 单独迭代项。

**决策**:**删除**,且单独一个 `chore(matter): remove out-of-scope components for P3+` commit(不与功能 commit 混在一起),方便 P3+ 阶段直接 `git revert` 起步。

**理由**:

- spec 明确划界,留下会 code rot + lint 噪音 + 后续重做时反而要消歧"老的还能用吗"
- 单独 commit 让 P3+ revert 路径干净,不夹带 MVP 功能改动

**Push back 条件**(IC 评估,默认按删除处理):如果发现超范围组件当前实现已经 work 且完整度高(不是半成品),可来回架构师重新评估是否扩 MVP 范围。本期 timeline-section 完整度尚可但仍按默认删除,留 P3+ 重新评估。

## D-4 设计稿对齐 → 扩展 MVP 范围(重要反转)

**背景**:Sidebar 实施完成后用户提供了 P3-matter 完整设计稿(列表 + 详情面板各一张),与 [`task-list.md`](./task-list.md) 文字描述差距大。架构师按"扩展 MVP"原则逐条裁定:

| 功能                                   | 性质                                                                | 本期                                                            |
| -------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------- |
| timeline-section(评论 / 活动 / 时间线) | matter 内部,不依赖其他 feature                                      | ✅ 做(平铺简版,见下)                                            |
| 主要目标编辑(description 富文本)       | matter 内部字段                                                     | ✅ 做(TipTap StarterKit + Placeholder + Link)                   |
| DDL pick(日期选择)                     | 通用 UI,shadcn Calendar + Popover 自封装                            | ✅ 做                                                           |
| AI 按钮(extractMatter)                 | matter 内部接口,无跨 feature 调用                                   | ❌ 留 P3+(payload 含 msgs,依赖 chat 消息上下文,跨 feature 耦合) |
| channel-picker(关联群聊)               | 强耦合 chat — 需要群列表 / 联系人选择 UI / 当前 conversation 上下文 | ❌ 留 P3+                                                       |
| SmartCreateModal(从 IM 消息抽取生成)   | 强耦合 chat — 入口是 chat 多选消息                                  | ❌ 留 P3+                                                       |
| ChatTodoPanel(chat 内联事项面板)       | 在 chat feature 里,纯跨 feature                                     | ❌ 留 P3+                                                       |

**对应 API endpoint 调整**:

- ✅ 加回:`GET / POST / DELETE /matters/:id/timeline`、`GET /matters/:id/activities`
- ❌ 仍不做:`linkChannel` / `unlinkChannel`、`extractMatter`(等 AI 按钮一起)

**timeline 简化决策**(对比原 dmworktodo 600 行版):

旧 dmworktodo `MatterDetailPanel/index.tsx` timeline 按 channel 分组(每个关联群有独立 timeline),嵌套在"关联群聊"卡片内 + "展开群内时间线"按钮触发。本期 channel-picker 仍 P3+,该入口不存在,故:

- 不分 channel 渲染 — timeline 平铺(matter-level 全量 GET,不传 source_channel_id)
- 不做附件上传 — IM 文件接口跨 chat feature
- 不做 @mention — MemberPicker 联动跨 contacts feature

P3+ 接 channel-picker 后,timeline-section 改为按 source_channel_id 分组渲染。

**实施分布**(commit 10–18):

- 视觉对齐 sidebar / detail header
- 装 react-day-picker + date-fns + shadcn Calendar/Popover
- 装 TipTap + 引入 RichEditor 通用组件
- DDL pick 集成 / 主要目标 TipTap 编辑
- timeline + activities API/queries/mutations 全套
- 二级 tabs 切换:关联群聊(P3+ 占位)/ 变更记录(activities)

**模板原则**(供后续 feature 参考):**判断扩展边界用"跨 feature 耦合"而非"功能完整度"** — 一个功能不依赖其他 feature 的 UI / 数据 / 接口就做,跨 feature 就推 P3+。这比按"P3+ vs MVP"清单裁更稳。

## 提交结构

按 spec 提交建议,18 个 commit 在 `refactor/p3-matter` 分支累积,最后开 1 个 MR 回 `main`:

| Commit | 主题                                                                          |
| ------ | ----------------------------------------------------------------------------- |
| 0      | `chore(matter): remove out-of-scope components for P3+`                       |
| 1      | `refactor(api): 抽公共 interceptor 工厂 + matter-client 复用 5 拦截器`        |
| 2      | `feat(matter): infinite query + mutations 工厂`                               |
| 3      | `feat(matter): UserName 组件 — WKSDK channelInfo 同步读 + 异步 fetch`         |
| 4      | `feat(matter): SidebarCard 取代 MatterCard`                                   |
| 5      | `feat(matter): QuickAdd 单行输入`                                             |
| 6      | `feat(matter): MatterList(tabs + infinite + archived 折叠)`                   |
| 7      | `feat(matter): MatterDetailPanel(只读 + 操作菜单)`                            |
| 8      | `feat(matter): 路由整合 — URL state + loader + 切换到 MatterList/DetailPanel` |
| 9      | `chore(matter): 收尾 — decisions.md + spec 修订 + final lint`                 |
| 10     | `feat(matter): sidebar 视觉对齐设计稿`                                        |
| 11     | `feat(matter): detail header 视觉对齐设计稿`                                  |
| 12     | `chore(deps): 装 react-day-picker + date-fns,引入 shadcn Calendar / Popover`  |
| 13     | `feat(matter): DDL pick 集成 detail header`                                   |
| 14     | `chore(deps): 装 TipTap + 引入 RichEditor 通用组件`                           |
| 15     | `feat(matter): 主要目标 TipTap 富文本编辑`                                    |
| 16     | `feat(matter): timeline 评论 / 时间线区段`                                    |
| 17     | `feat(matter): activities 变更记录 tab`                                       |
| 18     | `chore(matter): D-4 决策 + spec 同步 + final lint`                            |
