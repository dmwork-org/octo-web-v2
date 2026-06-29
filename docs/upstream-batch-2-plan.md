# 上游搬运 Batch 2 — 全功能覆盖计划

> 生成日期: 2026-06-15
> 文档分支: `docs/upstream-batch-2-plan`，基于新仓 `origin/main`
> 新仓基线: `frontend/octo-web-2` `origin/main` = `f9cb5e1`
> 老仓基线: `<legacy-octo-web-worktree>` `origin/main` = `b884e01e`
> 上一正式 audit checkpoint: `1906c874` (见 `docs/upstream-audit.md`)

## 目标

Batch 1 的策略是优先搬 chat / contact / login 主线，对 matter / summary / persona / appbot 等独立模块只记录 backlog 或 defer。本轮改为**全功能覆盖**:

- 重新审视 `1906c874..b884e01e` 的全部 upstream commits。
- Batch 1 未完成 / deferred / backlog 项重新纳入。
- 对每个 SHA 给出最终处理方向:搬运 / 差异核对 / 等效已具备 / 不适用。
- 不再以“模块未复刻好”为默认跳过理由；如果新仓已有基础，就补齐差异。

## 新增提交清单

`1906c874..b884e01e` 共 31 个 commit，其中本次重新 fetch 后比上一版计划新增 `b0c9a96d..b884e01e` 的 27 个 commit。

| SHA        | 标题                                                           | 处理方向                  |
| ---------- | -------------------------------------------------------------- | ------------------------- |
| `a780c9ba` | mention suggestion keyboard hover selection                    | 待搬 P0                   |
| `c13e7e27` | inline archive quick action                                    | 已搬于 Batch 1.3          |
| `29cf8643` | summary stale loading / overflow tooltip                       | 待核对 P1                 |
| `b0c9a96d` | user secrets management UI + chat deep-link                    | 待搬 P0                   |
| `48fdecd3` | pin GitHub reusable workflows                                  | 仓库 CI 不适用            |
| `fd8780de` | TRIAGE_WEBHOOK_URL workflow                                    | 仓库 CI 不适用            |
| `6deadc6a` | codeql weekly schedule                                         | 仓库 CI 不适用            |
| `13434a2c` | keep thread unread off parent recent rows                      | 待核对 P1                 |
| `aed22a85` | hide archived threads on first expand                          | 待核对 P1                 |
| `4479e965` | locate messages inside fold sessions                           | 待核对 P1                 |
| `0a67d7e8` | group owner transfer                                           | 待搬 P2                   |
| `c2b4d5d7` | remove deleted thread conversations locally                    | 待核对 P1                 |
| `732a0607` | archived threads in summary selector, exclude from forward     | 待核对 P1                 |
| `af7cbab5` | folded message recall UI                                       | 待核对 P1                 |
| `49e2b7d8` | suppress native context menu while custom menu open            | 等效核对 P2               |
| `517b87b3` | remove pr-contributor-welcome caller                           | 仓库 CI 不适用            |
| `e66ebabe` | sync sidebar thread list on archive/unarchive                  | 待核对 P1                 |
| `b22098c1` | enhance scheduled summary                                      | 部分已具备，需差异核对 P0 |
| `5be72036` | linkify rich text previews                                     | 等效核对 P2               |
| `5bc525d8` | complete reusable caller coverage                              | 仓库 CI 不适用            |
| `e94efe81` | scheduled summary deletion confirmation                        | 部分已具备，需核对 P1     |
| `82246a7a` | show all groups and threads in forward picker                  | 待核对 P1                 |
| `fe15ae53` | forwarding to thread silently fails                            | 疑似已具备，需回归 P1     |
| `3021b1b9` | verified real names in voice context + mention label           | 待核对 P1                 |
| `9676efc7` | stop fetching sticker category endpoint                        | 等效 / 不适用 P2          |
| `84949f19` | group incoming webhook management                              | 待搬 P0                   |
| `38179c92` | preserve scheduled summary source suffix                       | 待核对 P0                 |
| `c071042e` | webhook push URL examples + disable test for disabled webhooks | 待搬 P0                   |
| `a62b025d` | add all selected bots as admins                                | 待搬 P2                   |
| `a7f91b2e` | @所有人 mention highlight DOM regression                       | 测试补齐 P2               |
| `b884e01e` | strip client source_name from scheduled-summary submit         | 待搬 P0                   |

## 当前新仓观察

- `MentionList` 仍是单一 `activeIndex`，`onMouseEnter` 会直接覆盖键盘项，`scrollIntoView({ behavior: "smooth" })` 仍存在 hover 抖动风险。
- `Secrets` 模块未见管理入口；聊天粘贴密钥 guard 也未见实现。
- Summary 已有 schedule API、`ScheduleConfigModal`、`ScheduleFormModal`、interval day/week/month 的字段，但 `ScheduleFormModal` 仍会把 `source_name` 放入提交 payload，需要对齐 `b884e01e`。
- Forward modal 已有 thread candidate、clone content、channel info refresh 等逻辑，但候选来源仍主要基于 conversations + members，需要核对 cold cache / inactive groups / archived thread 排除。
- Group bot admin 当前 add 模式是单选，`setGroupBotAdmin(channelID, pickedUids[0])`，与 `a62b025d` 的“全部选中的 bot 都添加”为差异。
- 未发现 ChannelWebhook / IncomingWebhook 相关新仓实现，webhook 功能应作为独立 P0 搬运。
- 新仓没有 `.github` 目录，但已有自有 `.gitlab-ci.yml` 覆盖 main 分支 build/package/deploy；老仓 GitHub workflow 治理类 commit 不直接搬，除非后续项目决定在 GitLab CI 内补等价安全/质量 gate。

## Batch 2.1 — P0 Chat 输入与 Secrets 安全

- [ ] `a780c9ba` mention suggestion keyboard / mouse interaction split
  - 增加 interaction mode: `keyboard` / `mouse`。
  - 键盘上下移动时只更新 keyboard selected index，抑制 scroll 诱发的 hover。
  - mouse 只有真实 pointer move 后才接管 hover。
  - 替换 smooth scrollIntoView 为确定性的容器 `scrollTop` 边界对齐。
  - 扩充 `mention-list-keyboard` / `MentionList` 回归测试。

- [ ] `b0c9a96d` chat paste secret guard
  - 命中 `sk-` / `bf-` / `app-` 等明文密钥时硬拦截，明文不能进入 editor DOM / JSON / plain text。
  - 弹非阻塞提示，入口打开 Secrets 新增弹窗并一次性预填 value。
  - 预填明文关闭后必须清空，手动新增不得复用旧值。

- [ ] `b0c9a96d` Secrets 管理完整功能
  - 新增 `/v1/manager/secrets` client。
  - list 响应只保留 `secret_id/display_name/kind/masked/last4/created_at/updated_at/last_used_at` 等白名单字段。
  - Settings 新增 Secrets 入口；支持列表、空态、刷新、复制引用名、编辑、更新 key、删除。
  - Secret 编辑态必须 write-only，不回显原 key；空 value 只改名，非空 value 才替换 key。
  - i18n 补 zh-CN / en-US。

## Batch 2.2 — P0 Summary Schedule 全量对齐

- [ ] `b22098c1` scheduled summary interval day/week/month
  - 新仓已有 interval 配置基础，但需要逐项核对上游字段: `interval_days` / `interval_months` / `day_of_week` / `day_of_month` / `run_time` / legacy cron warning / enable-disable display。
  - 核对创建页、详情页、日程列表三处的创建、编辑、禁用、展示。

- [ ] `38179c92` preserve channel/thread/DM name suffix
  - 核对 scheduled summary 的 source label 是否保留群 / 子区 / DM 后缀，避免编辑后只剩裸名称。
  - 新仓 `chat-summary-new-modal.tsx`、`summary-create-modal.tsx`、`summary-create-workbench.tsx`、`personal-section.tsx` 均有 `source_name` 构造逻辑，需要统一。

- [ ] `b884e01e` strip client source_name from scheduled-summary submit
  - `ScheduleFormModal` 当前 `convToSource` 会提交 `source_name`；编辑已有 schedule 时还会把旧 `schedule.sources` 原样 push 回 payload。
  - 需要新增 schedule submit normalizer:提交时只发后端需要的 `source_type/source_id` 等身份字段，不发 client source_name。
  - 保留 UI 展示所需的 source_name，但不可进入 create / update schedule request body。

- [ ] `e94efe81` scheduled summary deletion confirmation
  - 新仓 `schedules-list.tsx` 已有 ConfirmDialog；需要核对 one-to-many 场景文案、影响范围提示、删除行为。

- [ ] `29cf8643` Summary loading / overflow tooltip
  - 核对 SummaryCard / SummaryDetail 是否仍存在 stale loading card。
  - 核对空字符串 hover 是否出现空 tooltip；必要时补 OverflowTooltip / TooltipCell。

## Batch 2.3 — P1 Thread / Forward / Fold Session

- [ ] `13434a2c` keep thread unread off parent recent rows
  - 核对 conversation digest / unread count 聚合逻辑，子区未读不能污染父群 recent row。

- [ ] `aed22a85` hide archived threads on first expand
  - 新仓已有 archived thread 分组和 thread status；核对首次展开是否 flicker。

- [ ] `e66ebabe` sync sidebar thread list on archive/unarchive
  - 核对 archive / unarchive 后 sidebar、thread panel、active/archived groups 是否实时同步。
  - 若 React Query / WK channel info tick 不够，补本仓风格的 invalidate / local update。

- [ ] `c2b4d5d7` remove deleted thread conversations locally
  - 核对 thread 删除事件或 datasource 变更后，本地 conversation list 是否清理孤儿子区。

- [ ] `4479e965` locate messages inside fold sessions
  - 新仓已有 `locate-reply-message.ts` 和 fold session render；需要回归 reply locate / search locate 命中 fold 内消息。

- [ ] `af7cbab5` folded message recall UI
  - 核对 fold session 内撤回消息展示、多选、右键菜单与展开态顺序。

- [ ] `732a0607` archived threads in summary selector, exclude from forward targets
  - Summary selector 需要支持 archived threads。
  - Forward targets 必须排除 archived threads。

- [ ] `82246a7a` show all groups and threads in forward picker
  - 当前 forward candidates 主要来自 conversations + members；需核对 cold cache / inactive group / inactive thread 是否缺失。
  - 必要时接 datasource / all-groups-all-threads API，并保持父群 + 子区排序。

- [ ] `fe15ae53` forwarding to a thread silently fails
  - 新仓已有 `cloneContent`、thread candidate、`wrapSendContentForInjection`；需要回归逐条 / 合并转发到 thread。
  - 核对 thread channelType 和 parent group metadata 是否符合 WKSDK / 后端契约。

- [x] `49e2b7d8` suppress native context menu while custom menu open
  - 新仓 `context-menu.tsx` 已在 document capture phase 处理 `contextmenu` 并 preventDefault；作为回归项处理。

## Batch 2.4 — P0 Webhook / Group 管理

- [ ] `84949f19` group incoming webhook management
  - 新增 Channel Settings 中的 incoming webhook 管理入口。
  - 搬运/改写 IncomingWebhook service、列表、创建/编辑、删除、启停、message webhook badge。
  - 对齐本仓 BaseDrawer / BaseDialog / i18n / toast 风格。

- [ ] `c071042e` webhook push URL examples + disabled test guard
  - Webhook URL modal 中补 curl / fetch / Python 等调用示例。
  - disabled webhook 禁止测试，并给明确状态说明。

- [ ] `0a67d7e8` group owner transfer
  - 新增 owner transfer API client 和 UI 入口。
  - 仅 owner 可见；候选人排除自己 / bot；成功后刷新 subscribers 和 channel info。

- [ ] `a62b025d` add all selected bots as admins
  - 当前 Bot 管理员 add mode 单选；若产品要求与上游一致，改成可多选并批量提交。
  - 若后端只有单 uid endpoint，则前端串行 / 并发调用并处理部分失败。

## Batch 2.5 — P1 Voice / Mention / Message Render

- [ ] `3021b1b9` verified real names in voice transcription context and mention label
  - 核对 voice transcription context 是否传 verified real name，而不是昵称或 display name。
  - 核对 mention label resolver: 文本渲染、语音转写插入、AI context 构建三处显示一致。

- [ ] `a7f91b2e` @所有人 mention highlight DOM regression
  - 新仓有 `mention-aware-text.test.tsx`；补 `@所有人` / `@所有AI` / sticky mention 的 DOM 回归用例。

- [x] `5be72036` linkify rich text previews
  - 新仓 richtext renderer 已向 `MentionAwareText` 传 `linkify`，作为回归确认项。

- [x] `9676efc7` stop fetching unimplemented sticker category endpoint
  - 新仓 emoji picker 目前只有 emoji tab，注释说明 sticker P3+；未发现 sticker category fetch，标记等效 / 不适用。

## Batch 2.6 — P1 Matter 全功能闭环

Batch 1 曾因 matter 未复刻完整而 defer；当前新仓已有 MatterDetailPanel / OutputsPanel / LinkChannelModal / SmartCreateModal，本轮继续保留全功能闭环要求。

- [ ] `66d474c9` unify create-task modal: Matter 主视图新建入口与 chat 多选创建入口统一策略。
- [ ] `60afb75e` outputs tab: 文件名、描述、发送者、来源群、时间、预览、下载、隐私 badge、分页/搜索逐项核对。
- [ ] `5b65f5ce` recent files: chat / thread / matter timeline 到 outputs 的附件链路核对。
- [ ] `f2d723fb` timeline attachments preview/download: 附件卡片信息、下载 fallback、preview bridge。
- [ ] `01cd20a1` support linking threads: LinkChannelModal 中 thread 搜索、选择、提交契约核对。

## Batch 2.7 — P2 Contact / Persona / AppBot 长尾

- [ ] `f55f0bec` private chat add member -> create group: 私聊设置 / 用户资料增加“添加成员/创建群聊”入口。
- [x] `0e494e60` persona bot picker filters my bots by creator_uid: 本仓已按 creator_uid 过滤并去重。
- [ ] `bce18fbe` hide persona settings behind experimental features: 产品确认 persona 是否仍需实验开关；若已正式入口则标记不适用。
- [ ] `c0319928` PersonaCreate listener fan-out: 本仓 React Query 方案下核对 grant 创建/删除后的 invalidate 覆盖。
- [ ] `7d4800a3` app bot nav icon color: 对照本仓 NavRail active/hover token，等效则标记已具备。

## Batch 2.8 — CI / 文档回填

- [~] `48fdecd3` / `fd8780de` / `6deadc6a` / `517b87b3` / `5bc525d8`
  - 已核对老仓 5 个提交，均只修改 `.github/workflows`：reusable workflow pin 到 `@v1`、issue/PR 通知 caller、CodeQL weekly schedule、删除 pr-contributor-welcome、补 dependency-review/history-check/pr-title-lint/secret-scan caller。
  - 新仓没有 `.github`，但已有项目自有 `.gitlab-ci.yml`，负责 main 分支 `pnpm build`、Docker package、K8s deploy；直接搬 GitHub Actions 不会服务当前仓库流水线，还会引入老仓 GitHub/org 平台假设。
  - 本批判定为不搬。若后续需要 dependency review、secret scan、PR title lint 或 CodeQL 等价能力，应按本仓 GitLab CI / 平台 CI 规范单独立项，不混入 upstream 功能搬运。

- [x] `39284abf` RichText clipboard round trip
  - 已由 issue #125 / MR !122 搬入 `main`。
  - 已在 Batch 2.8 文档回填中把 Batch 1 原 deferred / P3 状态改为“后续 issue #125 已完成”。

## 建议执行顺序

1. **Batch 2.1** Chat 输入与 Secrets 安全: 高风险、高频入口，优先。
2. **Batch 2.2** Summary Schedule: 新增 upstream 中最集中且新仓已有基础，先做差异收敛。
3. **Batch 2.3** Thread / Forward / Fold Session: 影响聊天主链路，按 archive/unread/forward/locate 拆 2 个 MR。
4. **Batch 2.4** Webhook / Group 管理: webhook 是独立大功能，group owner/bot admin 可作为同域小 MR。
5. **Batch 2.5** Voice / Mention / Message Render: 多数是核对和回归测试，穿插处理。
6. **Batch 2.6** Matter 全功能闭环: 范围最大，拆 outputs/recent-files 与 create/link/timeline。
7. **Batch 2.7** Contact / Persona / AppBot 长尾。
8. **Batch 2.8** CI 判定和文档状态回填。

## 验收策略

- 每个 batch 一个或多个独立 MR，MR 描述列出覆盖的 upstream SHA。
- 对“等效已具备”项必须写明新仓文件和行为证据。
- 对“全功能覆盖”项不允许只写 deferred；除非明确“不适用”并有架构/产品理由。
- 代码验证至少包含:
  - `pnpm exec tsc --noEmit`
  - touched files `vp check --fix ...`
  - 涉及页面可运行时，用 Browser 做基础交互验证。
