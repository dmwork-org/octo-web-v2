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

## 提交结构

按 spec 提交建议,9 个 commit 在 `refactor/p3-matter` 分支累积,最后开 1 个 MR 回 `main`:

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
