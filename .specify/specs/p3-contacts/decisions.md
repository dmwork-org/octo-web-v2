# P3-contacts 实施决策记录

> IC 实施 P3-contacts 期间的关键决策,供后续 feature(summary / appbot)spec 参照。
> 沿用 [`p3-matter/decisions.md`](../p3-matter/decisions.md) 的 D-1 ~ D-4 原则,本文件只记本期的**新决策**。

## D-1 起步状态:增量改造 + audit 先行

**背景**:启动 P3-contacts 前,`src/features/contacts/` 已存在 1486 行实现(7 components / 1 view / 2 api / 4 query / 2 types),与 P3-matter 当时"从零迁移"的起步状态本质不同。

**决策**:**audit 先行 + 按报告补差**。commit 0 不动代码,只产 [`audit.md`](./audit.md) 对位旧 `dmworkcontacts` 8 模块,标 ✅ / ⚠️ / ❌ 三态。后续 commit 按 audit 行动项跑。

**理由**:

- 现有代码基建已用对(ofetch / TanStack Query v5 / file route / shadcn / 0 `any`),推倒重写浪费成果
- `task-list.md` 原 9 commit 是按"从零迁移"模板写的,实际很多任务现状已满足
- audit 报告反向修订原计划,避免 IC 按过期文档闷头干

**实际效果**:9 commit → 5 commit(砍掉 query factory / vercode / structure-lint 白名单 / Organizational 占位 4 个 commit)。

**模板原则**(供 summary / appbot 参考):**起步状态决定节奏** — 跨 P1 占位代码已存在的 feature 用 audit-first;datasource 这种从零的用 matter 范式。

## D-2 endpoints 位置:现状即正解,**不**反转

**背景**:contacts 的 `friends.api.ts` / `friend-applies.api.ts` 在 `features/contacts/api/`(独占),`space.api.ts` / `robot.api.ts` / `group.api.ts` / `blacklist.api.ts` 在 `features/base/api/endpoints/`(共享)。

**决策**:**现状即符合 [P3-matter D-2 模板原则](../p3-matter/decisions.md#d-2-endpoints-位置反转-task-list保留-featuresmatterapi)**,本期**不**调整 endpoint 位置。

**理由**:

- friend / friend-apply / reddot 是 contacts 独占业务域(只 contacts feature 消费),已在 feature-local
- space / robot / group / blacklist / user 是 IM 域共享(chat / matter 也消费),已在 base
- contacts 走 IM 主接口 `/v1/`,**不**像 matter 因 `/matter/api/v1` 独立部署而建独立 client — 直接复用 `features/base/api/client.ts`

**模板原则**(供后续 feature 参考):D-2 的判断标准是"业务域归属",不是"机械迁库"。每次新 feature spec 时复用此判断即可。

## D-3 跨 feature 耦合:structure-lint 不查 import,纯文档化

**背景**:`scripts/structure-lint.ts` 只检查目录 / 文件名 / 后缀约定,**不**检 ES module import 语句。原 `task-list.md` commit 7 假设 structure-lint 会拦下 contacts → chat 引用,要求加白名单 — **这是 spec 误判**。

**实际跨 feature 引用**(10 处):

| 引入符号              | 文件数 | 用途                                                     |
| --------------------- | ------ | -------------------------------------------------------- |
| `ChannelAvatar`       | 8      | 头像渲染(全部子页消费)                                   |
| `chatSelectedActions` | 2      | 点联系人 / AI 开对话(`friend-list` / `botfather-banner`) |
| `ChatMain`            | 1      | 右栏复用 chat 主容器(`contacts.view`)                    |

**决策**:**纯文档化,P4+ 解**。本期不动代码,本 decisions.md + audit.md 留下"未来去向"清单:

- `ChannelAvatar` → 抽到 `features/base/components/`(IM 通用 UI,屬于"跨 feature 共享 + IM 域共消费",符合 D-2 上行原则)
- `chatSelectedActions` → 抽 `features/base/stores/` 或保留 chat 让 contacts 通过事件总线 / router 解耦
- `ChatMain` → 替换为"通讯录详情面板"

**理由**:

- 不是本期新建的耦合 — 这是 P1 阶段写下的初版代码,现状继承
- 解耦本身是独立工作量(抽 ChannelAvatar 改全 chat / matter / contacts 引用 + 测回归 + 跑 8 处 import path 改写),不应包在 contacts spec 里
- structure-lint 不查 import = 编译/测试阶段不会 break,P4+ 节奏稳

**模板原则**(供后续 feature 参考):**结构 lint 不能 catch 的耦合,在 decisions.md 显式登记"已存在的耦合"清单**,后续 feature 复用同样模式 — summary / appbot 起步前先 grep 自家 → chat 的 import 数量,登记在自家 decisions.md。

## D-4 enabled-gated query + loader:机会主义预热,组件保留 `useQuery`

**背景**:contacts directory 4 个 query(spaceMembers / myBots / spaceBots / myGroups)的 `queryOptions` 都设 `enabled: !!spaceId` — spaceId 缺失时不发请求,组件用 `useQuery` 安全。`implement-route-with-query-loader` skill 强制用 `useSuspenseQuery`,但 enabled-gated 场景下 `useSuspenseQuery` 在 spaceId null 时会 throw,与 enabled gate 设计冲突。

**决策**:loader **机会主义预热**(`if (!spaceId) return;` 跳过),组件保留 `useQuery`。

**理由**:

- spaceId 是异步 store 状态,初始化时可能 race(loader 跑时还没 ready)
- enabled gate 是已有的兜底机制,改成 useSuspenseQuery 反而要在 loader / 组件双侧重复处理 spaceId null
- loader 价值在"有 spaceId 时把 4 个 RTT 折叠为并行 1 个 RTT" — 这个价值不需要 useSuspenseQuery 配合也能拿到
- 沿用 P3-matter loader 范式(matter loader 同样用 `if (!spaceId || !myUid) return;` skip)

**模板原则**(供后续 feature 参考):**skill 是默认范本,不是教条**。enabled-gated 场景偏离 skill 强制项时在 decisions.md 记一句即可,review 时看到 "enabled gate" 关键词就知道为何不 useSuspenseQuery。

## D-5 视觉对齐:不预判,IC 启动 dev server 后肉眼对比再说

**背景**:`task-list.md` commit 6 原写"对照旧 dmworkcontacts 视觉调整"。audit 时未跑 dev server,无法判断当前实现与旧版 / 设计稿差距。

**决策**:本期**不预设视觉调整 commit**。视觉对齐合到 commit 8(本 commit)做最后验证;若跑 dev server 走 6 条手动验收时发现明显问题,单独起 commit 修;若无问题,本期不动视觉。

**理由**:

- audit 阶段无运行时观察,凭代码 grep 判断视觉差距不可靠
- 视觉调整通常是迭代 — 跑起来 → 看 → 微调 → 再跑,把它压成 1 个 commit 反而困难
- 节省时间,把"假设的视觉调整"工作量留到真发现差距时再投

**模板原则**:**没运行时观察的视觉对齐任务在 audit 阶段降级为"待定",commit 8 收尾时由 IC 跑 dev 决定**。

## 提交结构

5 commit 在 `refactor/p3-contacts` 分支累积,最后开 1 个 MR 回 `main`:

| Commit | 主题                                                                          |
| ------ | ----------------------------------------------------------------------------- |
| 0      | `docs(p3-contacts): spec 三件套(spec / api-mapping / task-list)`              |
| 0      | `chore(contacts): commit 0 audit — 现有代码 vs 旧 dmworkcontacts 对位`        |
| 1      | `feat(contacts): friend-list 改用 base/lib/pinyin-bucket`                     |
| 2      | `feat(contacts): sub-page 改 URL state (?sub=...)`                            |
| 3      | `feat(contacts): 路由 loader 预热 directory 4 个 query`                       |
| 4      | `chore(contacts): D-1~D-5 决策 + MANIFEST 扩写 + task-list 同步 + final lint` |
