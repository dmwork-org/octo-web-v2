# octo-web 重构交接 — 2026-05-29

> 新 session 启动后**第一件事**:读完本文件 + `CLAUDE.md`,再决定下一步。
> 本文是当前阶段截面图,不是历史叙事 — **只看本文不会让你做错事**。

---

## 一、当下位置(时间锚点)

- **基准 commit**:`97a7c63`(MR !16 `refactor/p3-matter` 合到 main,2026-05-29)
- **完成里程碑**:P0 / P1 / P2 / **P3-matter** 全部落地
- **进行中**:P3 剩 3 个业务 feature(contacts / summary / appbot)+ datasource(尚未起 feature 目录)
- **未开始**:P4 富 UI 能力 / P5 灰度

---

## 二、已完成(可直接当背景知识用,**无需重读**)

| 模块 | 关键产物 | 参考路径 |
|---|---|---|
| **P0 auth** | login 闭环 + 401 重定向 + token refresh | `routes/login*.tsx`, `features/base/stores/auth.ts` |
| **P1 base 框架** | AppShell + Sidebar + 7 路由空壳 + ofetch 拦截器栈 + Semi bridge 高频组件 | `features/base/{layout,api,components}/` |
| **P2 IM 主路径** | Provider + 18 类 message renderer + 关注分组 + 语音 + composer + 消息列表 | `features/chat/`(完整) |
| **P3-matter** | 26 commits / +3500 行 / spec 5 条全过 + D-4 扩展(DDL/TipTap/timeline/activities) | `features/matter/` + `.specify/specs/p3-matter/` |

⚠️ contacts / summary / appbot 已有 P1 阶段写下的初版代码(类似 matter 当时的状态),**质量未审计** — 进 P3 实施时按 D-1 决策"增量改造"而非推倒重写,但要先扫一遍判断哪些能用。

---

## 三、剩余工作清单

### A. P3 业务 feature(并行候选,**优先级高**)

旧项目源码 `octo-web/packages/`,新项目落点 `src/features/<name>/`:

| feature | 旧源 | 现有代码状态 | 难度 | 跨耦合 |
|---|---|---|---|---|
| **contacts** | `dmworkcontacts/` | 7 components / 1 view / 2 api / 3 query — **较完整,需审计** | 中 | 弱(IM channel 只用读) |
| **summary** | `dmworksummary/` | 10 components / 1 view / 1 api / 1 query — **较完整,需审计** | 中-高 | 中(@消息 / 消息引用展示) |
| **appbot** | `dmworkappbot/` | 仅 1 component / 1 view — **placeholder** | 中 | 弱 |
| **datasource** | `dmworkdatasource/` | **未起目录**,从零做 | 中 | 弱 |

**操作流程**(沿用 P3-matter 验证过的模板):

1. 起 spec → `.specify/specs/p3-<feature>/{spec.md,api-mapping.md,task-list.md}` — 模板抄 matter 那份,把"D-2 endpoint 位置"原则写进 spec(放 `features/<feature>/api/`,不污染 base)
2. 单独 worktree + 单独 session 实施
3. spec → MR → merge,每个 feature 一个 MR

### B. P3-matter 续做项(必须先做完 channel-picker,**不并行**)

按优先级降序:

1. **channel-picker**(关联群聊真功能)
   - 当前是 disabled 占位
   - 强耦合 chat:需要群列表 / 联系人选择 UI / 当前 conversation 上下文
   - 完成后才能挂 timeline-section UI(代码已就绪,等这个解锁)
2. **timeline-section UI 挂载**
   - API/queries/mutations 已写好(commit `0788ee4`)
   - 等 channel-picker 完成后,挂到群卡内 source_channel_id 分组渲染
3. **SmartCreateModal**(从 IM 消息抽取生成 matter)
   - 入口在 chat 多选消息 → POST `/matters/extract`
   - 强耦合 chat,需要 chat 那边加多选模式 + "创建事项"操作
4. **AI 按钮 / extractMatter**(同 SmartCreate,可一起做)
5. **ChatTodoPanel**(在 chat feature 加事项面板)— 跨 feature
6. **VoiceInput / AiBadge** — 旧 `@octo/base` 跨 feature 依赖

### C. P4 富 UI 能力(部分已启动)

| 组件 | 状态 |
|---|---|
| TipTap RichEditor | ✅ 已在 matter 引入(commit `beabc4d`),`components/rich/` 可复用 |
| shadcn Calendar / Popover | ✅ 已装(commit `d53b6b8`) |
| PdfViewer | ❌ 未做 |
| Lottie | ❌ 未做 |
| VoiceRecorder | ❌ 未做(chat composer 里有 voice,但通用组件未抽) |
| DataTable / VirtualList | ❌ 未做 |
| Excel 导出 | ❌ 未做 |
| @dnd-kit 包装 | ❌ 未做(关注 tab 拖拽 P3+ 留) |

按需做 — 业务 feature 真用到再抽。

### D. 关注 tab P3+ 留项(在 chat feature)

- 拖拽排序(@dnd-kit + `/follow/sort`)
- 跨分组移动右键菜单
- 子区主动 follow / unfollow + DM 关注入口
- 子区 overflow `+N` 折叠

---

## 四、推荐下一步:contacts P3

**理由**:

- 现有代码完整度看起来比 summary 高(7 个完整组件 + 多 query),且依赖最弱(只读 IM channel)— 跑通 P3 流程的"难度第二低"选项(最低是 appbot 但 appbot 几乎全空,等于从零做)
- 业务模板 P3-matter 已验证,可直接复用
- 给 summary / appbot 当模板:contacts 跑通后,后两个直接套

**起手姿势**(给 IC 用):

1. 架构师(主 session)写 `.specify/specs/p3-contacts/{spec,api-mapping,task-list}.md`
2. 用户开 worktree:
   ```bash
   git fetch origin
   git worktree add ../octo-web-contacts refactor/p3-contacts origin/main
   cd ../octo-web-contacts
   claude
   ```
3. IC 第一句:`读 .specify/specs/p3-contacts/ 全部文件 + docs/handoff.md,按 task-list 顺序开干`

---

## 五、新 session 启动 checklist

进任何新 session 前:

- [ ] **读 `CLAUDE.md`** — 项目级硬约束(自动加载,不用手动读但要遵守)
- [ ] **读本文件** — 当前阶段位置 + 接下来做什么
- [ ] **读 `.specify/specs/p3-matter/decisions.md`** — D-1/D-2/D-3/D-4 四条决策原则,新 feature spec 要继承
- [ ] **读对应 feature 的 spec**(如果已写好)→ 没写好就**先写 spec**,别直接动代码
- [ ] 跑 `git log origin/main -10 --oneline` 看最近 10 个 commit,补本文件未覆盖的最新动向
- [ ] 跑 `pnpm check` 确认基线绿(本文落笔时:0 errors / 6 warnings 全在 contacts feature 预存在)

---

## 六、长期结构原则(从 P3-matter 总结,继承)

**业务封装**:

- 跨 feature 共享 + IM 域共消费的 endpoint → `features/base/api/endpoints/*.api.ts`
- 单 feature 独立业务域(独立后端服务 / 独立 baseURL)→ `features/<feature>/api/*.api.ts`(参 D-2)

**MVP 划界**:

- 跨 feature 耦合的功能(强依赖另一 feature 的 UI / store)→ 默认留 P3+
- feature 内部完整功能 → 本期做完(参 D-4)

**spec 模板**:

- 每 feature 三件套 `.specify/specs/p3-<x>/{spec.md, api-mapping.md, task-list.md}`
- spec 的"不做(P3+ 留)" 章节写明跨 feature 部分,IC 不主动越界
- 实施过程中决策走 `decisions.md` 续写

**改动 commit**:

- 一个子功能一个 commit,不混合
- "删掉超范围代码"单独 commit,P3+ 起步好 revert
- 写 mutation/query 工厂时触发对应 skill,按 SKILL.md 范本写

---

## 七、当前 worktree / 分支拓扑

- main worktree:`/Users/nancy/Desktop/workspace/octo/refactor-2/octo-web`(当前 session 在此)
- P3-matter worktree:`/Users/nancy/Desktop/workspace/octo/refactor-2/octo-web-matter`(已 merge,可清理 — `git worktree remove`)

未清的本地分支:见 `git branch`,大多数已合到 main,可按需 `git branch -d` 清理。

---

## 八、有疑问时

- **架构 / 跨 feature 设计**:回主 session(对应这份 handoff 写出来的 session)沟通
- **spec 不够清楚**:别猜,问主 session 让其修订 spec
- **改动越出 spec 范围**:停手,让架构师裁定(参 D-4 经验:用户提供新设计稿后扩了 MVP)
- **lint hook 卡住编辑**:按提示修,**别绕开**(`--no-verify` / 重命名文件 / MultiEdit 都不行)
