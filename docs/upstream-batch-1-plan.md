# 上游搬运 Batch 1 — Todo 清单

> **生成依据**:`docs/upstream-audit.md`(baseline `f32a1360` → HEAD `1906c874`,共 109 commits)
> **优先级原则**(陈超 2026-06-08 决策):
>
> - **P0 高优**:chat / contact / i18n + matter/summary/persona 中跟 chat/contact 关联的
> - **P2 低优(backlog 记录,先不做)**:matter / summary / persona 独立改动 — 这 3 个模块新仓本身没复刻好,先记录待后续
> - **杂项**:CI / ISSUE_TEMPLATE / CODEOWNERS / docs(upstream 自维护) — 跳过
> - **Login**:作为基础设施,中优(P1) — 不在 chat/contact 主线但全局影响
> - **AppBot**:1 个小 fix,低优

执行节奏:每个 batch 一个独立 MR,跑完手测确认 → 合并 → 更新 `docs/sync-log.md` baseline → 下一个 batch。

---

## P0 — 高优搬运

### Batch 1.1 — i18n 基础设施(3 commits)

**先做这一批**:新仓没 i18n 框架,后续搬业务时 string 就裸 hardcoded,以后再补 i18n 成本翻倍。先把基础设施搬过来,后续 batch 自然带 i18n。

- [x] `b79eab8d` 2026-05-28 **feat(i18n): add frontend internationalization** — 295+ files,整套 i18n 框架 + locale 文件
- [x] `fe5bbc5d` 2026-05-29 **feat(i18n): align backend language contract** — 39+ files,跟后端 language header 对齐(本仓 ofetch interceptor 形式,只搬 Accept-Language;backend user.language sync 因本仓登录流程未复刻该接口而跳过)
- [~] `f223293f` 2026-05-28 **fix(i18n): sync Semi locale with app language** — 本仓不用 Semi UI(用 shadcn/ui + tw),**跳过**

**完成于 2026-06-08(MR #29 已合并)**:实际搬了 156 files / locale 287→2738 keys,8 个 commit 分 step。架构关键点:`useT()` reactive hook(useSyncExternalStore 订阅 i18n.subscribe),非 React 上下文用 `import { t } from "@/lib/i18n/instance"`;切语言入口在 NavRail 底部齿轮上方(Languages 图标)。

**手测**:NavRail 翻译图标点击 → zh-CN ↔ en-US toggle;chat/contact/matter/summary/appbot/login 各页面文案切换 OK;Network 面板 API Accept-Language header 跟随 locale。

---

### Batch 1.2 — Chat 输入框 / mention(8 commits)

- [~] `e33d3887` 2026-06-05 fix: resolve mention nodes returning 'undefined' in textBetween leafText — 新仓 voice 简化为"录音→文件",无 voice-to-text 编辑模式,无对应 `textBetween()` / `getCurrentText` code path,**跳过**
- [x] `006b2411` 2026-05-22 fix(message-input): preserve multiline content when pasting lists
- [x] `2e89e772` 2026-05-31 fix(voice-mention): 语音 @所有AI 识别 + @所有人 走 humans
- [x] `405bbe98` 2026-05-23 fix(mention): expand bot UIDs into mention.uids on @所有AI + skip broadcast token
- [x] `90556da2` 2026-06-05 fix(mention): protect all-ai routing uids(合并到 receiver 侧 commit,本仓改 text-renderer fail-closed guard;跳上游 sender entities)
- [x] `76189c1d` 2026-06-03 fix(message): highlight broadcast mentions(合并到 receiver 侧 commit,text-renderer 加 humans/ais broadcast token)
- [x] `ff46fa58` 2026-06-02 fix(message-input): hide broadcast mentions in direct chats
- [x] `bbac229d` 2026-05-27 fix(conversation): block folder drop to prevent ghost file messages

**完成于 2026-06-09(MR #10 已合并)**:6 本仓 commit / 8 上游 SHA(2 合并 + 1 跳过)。手测全过。

**手测**:输入框 @全员/@所有AI/@某人 各场景;粘贴 list 不丢行;拖文件夹被拦截。

---

### Batch 1.3 — Chat 会话列表 / 排序 / 折叠(11 commits + 3 补)

- [x] `f85ba4d0` 2026-06-06 fix(chat): trust backend recent conversations
- [x] `1f8c40a2` 2026-06-05 feat: navigate recent tab to unread conversation
- [x] `de16d69f` 2026-06-06 fix(chat): move mention badge to preview area
- [~] `275762d7` 2026-06-06 fix: preserve compact thread collapse with disabled pin split — 新仓 follow-list 是独立 hook 体系,跟上游 ConversationList class component 的 disablePinSplit 不同语义,**跳过**
- [x] `5dbc0c40` 2026-06-06 fix: use setActivatorNodeRef to isolate drag activation on handle
- [x] `645fa295` 2026-06-08 fix: hide archived threads in follow list when expanding group
- [x] `35b35757` 2026-06-02 Fix/issue 193 thread list follow
- [x] `72a8adc3` 2026-06-04 fix(#203): sync sidebar snapshot on conversation unread change
- [x] `2c5eccbb` 2026-06-02 fix: refresh followed sidebar after thread creation
- [~] `ff7f39f1` 2026-05-27 fix(chat): refresh recent ordering on live updates — 新仓 sortConversations 已返新数组(`[...list].sort()`)+ useQuery 自动 refetch,无 ChatVM class 原地 sort 问题,**跳过**
- [x] `1286d289` 2026-06-06 fix(datasource): pass recent filter for recent conversations

**补搬 3 个 baseline 之后新增 SHA(陈超 2026-06-09 验证发现缺失 → A 方案全补)**:

- [x] `1906c874` 2026-06-08 fix: unify thread archive action visibility across entries — 提取 canManageThread 父群口径,两处归档入口共享权限判定
- [x] `c13e7e27` 2026-06-08 feat: add inline archive quick action to active thread list — 每行 inline 归档按钮 + 5s 撤销 toast
- [x] `23b59a41` 2026-05-27 Fix thread archive state refresh — 归档子区发消息后自动 reactivate + composer 上方 archivedInputNotice

**完成于 2026-06-09(MR #13 已合并)**:11 本仓 commit / 14 上游 SHA(2 跳过 + 3 baseline 后补)。手测全过,数据双源融合(sidebar 推 is_followed)+ status:"all" 列表口径修复。

**手测**:最近 tab 点击跳到第一条未读;sidebar unread 数实时变;创建子区后 follow tab 立即出现;归档子区在 follow tab 展开父群时隐藏;thread panel 每行 inline 归档按钮 + 5s 撤销;detail view 三点菜单含归档/取消归档项;已归档子区 composer 上方提示 banner,发消息后 reactivate。

---

### Batch 1.4 — Chat 消息渲染 / 文件预览(8 commits)

- [x] `c1eaadca` 2026-06-08 fix: align AI assistant history timestamps
- [x] `97dbec4d` 2026-05-31 fix(conversation): show last message of fold session when expanded(本仓 fold-session 简化版无 slice,等效已修)
- [x] `ed5cfbcd` 2026-05-30 fix(ai-chat): preview files in folded sessions instead of downloading(本仓 file-renderer 整卡 click 走 openFilePreview,fold session 复用 MessageDispatch,等效已修)
- [x] `4b2e89c0` 2026-05-28 fix(file): prefer filename suffix over content.extension for preview detection
- [x] `e41a1d7b` 2026-05-28 fix(#125): 合并转发中文件卡片点击应弹出预览而非下载
- [x] `817f87a6` 2026-05-27 fix: show pending state for image sends
- [x] `2b1c78c3` 2026-06-08 修复群聊 AI 备注名不立即生效
- [x] `195625e8` 2026-05-27 Fix message grouping for same-sender messages after long gaps

**手测**:AI 折叠 session 展开后能预览文件 / 看时间;mergeforward 内文件点了弹预览;图片发送中 pending 态;群里 AI 改备注立即生效。

---

### Batch 1.5 — Chat 会话窗口 / scroll / typing(8 commits)

- [x] `30185565` 2026-06-02 fix(conversation): clear draft after sending(本仓 dropDraft 已对齐,新补 formatDraftPreview 渲染 @mention placeholder)
- [x] `1bfc1b4e` 2026-06-04 fix: restore conversation scroll anchors(**不搬 / 本仓 design 永远回底部不做中间位置恢复**)
- [x] `7a42c23a` 2026-06-01 fix(typing): reset typing on foreground/reconnect
- [x] `c1c17307` 2026-06-03 fix: stabilize local message send ordering(本仓 React Query 单一 cache + timestamp 主键,无 c1c17307 的多副本 bug 模型)
- [x] `2ce66f09` 2026-05-29 fix: stabilize AI streaming message layout(本仓 typing 不进 message list + fold session 简化版,等效已修)
- [x] `c2f9e18e` 2026-06-06 fix(#308): treat screenshot as boundary message in messageContinuity
- [x] `23b59a41` 2026-05-27 Fix thread archive state refresh
- [x] `d8213ec1` 2026-05-27 fix(upload): preflight credentials so rejected files surface error

**手测**:发送后草稿清;翻历史不抖;AI 流式不抖;tab 失焦回来 typing 清零;消息顺序稳;上传被拒能看到原因。

---

### Batch 1.6 — Chat / Contact 跨模块 + 群管理(5 commits)

跨模块归这里(包括 contact 的两个 P0)。

- [x] `8712d79e` 2026-05-22 fix(follow,mergeforward): keep follow tab on create group + restore SDK conv cache after space switch(8 sub-feature 中 7 等效 / 1 适用搬:右键"新建分组"会话归类)
- [x] `b04a0618` 2026-06-03 fix(wkmodal): guard against Semi modal overrides(**不适用 / 本仓无 Semi UI**)
- [x] `7bc98795` 2026-06-02 fix(contextmenu): 群聊右键菜单撤回按钮根据角色权限隐藏(已在另 MR `fix/revoke-align-old-repo` 搬完,本 batch 不重复)
- [x] `bbac882b` 2026-06-04 fix(group): move allow-no-mention toggle into Group Management screen(合并到 ceffa569 同 commit,本仓一步到位放 group-management)
- [x] `ceffa569` 2026-06-04 feat(octo-web): group-level allow no-mention toggle (owner/admin)

**手测**:切 space 后 SDK 缓存还在;切 contact tab 不卡;群设置里有"允许无@消息"开关;右键撤回按角色隐藏。

---

### Batch 1.7 — Contact P0(4 commits)

- [x] `f55f0bec` 2026-06-04 fix: create group from private chat add member(**deferred / 本仓私聊场景无"加成员"入口,无 bug 可修,要先实现 feature**)
- [x] `2b974c00` 2026-06-02 fix(contacts): allow search results to scroll(**等效已修 / Tailwind flex min-h-0 overflow-y-auto 已对齐**)
- [x] `ce693bd3` 2026-05-29 Improve contacts tab switching(**等效已修 / 本仓不用虚拟列表,filter chips 切换走 map 数据变,DOM 不 unmount,scroll 自然保持**)
- [x] (P1)`5b65f5ce` 2026-05-29 Fix/matter recent files display(**deferred / 跨 chat+matter+thread+file-preview+outputs 5 模块,需架构级 store 改造,本仓 React+TanStack 跟老仓 mittBus 完全不同**)

**手测**:私聊里加成员能创群;通讯录搜索结果能滚;通讯录 tab 切换流畅。

---

### Batch 1.8 — Chat 大特性 1:RichText 14 图文混合(4 commits)

文件多、改动大,单独 MR。

- [ ] `b1bb31df` 2026-06-03 feat(octo-web): 接收渲染 RichText=14 图文混排 (Phase 1)
- [ ] `b5a3b68e` 2026-06-03 feat(octo-web): send RichText=14 mixed text+image + SmartCreateModal digest (Phase 1)
- [ ] `fff36eb1` 2026-06-04 feat: migrate rich text mixed content UI
- [ ] `39284abf` 2026-06-08 Fix rich text mixed message clipboard round trip

**手测**:粘贴图+文混排发出去;接收方正确渲染;复制走 round trip 不丢东西。

---

### Batch 1.9 — Chat 大特性 2:BotManage 三级下钻(2 commits)

- [ ] `e7c5e0be` 2026-06-03 [octo-web] 独立 Bot 管理模块（三级下钻）+ 免@回答群列表
- [ ] `ee4275b4` 2026-06-03 fix: restore bot remark editing
- [ ] `d6c20ed4` 2026-06-02 fix: unify avatar upload handling

**手测**:点 bot 头像 → 三级下钻 → 免@回答群列表;改 bot 备注能保存;头像上传统一行为。

---

### Batch 1.10 — Chat 大特性 3:Voice 设置面板(5 commits)

- [ ] `c0a6f1ea` 2026-05-22 feat(voice): ASR privacy controls — feedback settings, notice popup, keyboard fix
- [ ] `aec22081` 2026-05-26 feat: voice settings panel redesign
- [ ] `ed5bc4bd` 2026-05-27 feat(voice): local ASR toggle in VoiceSettingsPanel + fix triple probe
- [ ] `9d1fa159` 2026-05-26 feat: include ASR params in uploadLocal feedback metadata
- [ ] `c4fd2a13` 2026-05-28 feat: use reset endpoint instead of delete for restoring defaults

**手测**:NavRail 设置 → voice 面板有隐私开关 / 重设;录音时键盘交互;ASR 上传元数据完整。

---

### Batch 1.11 — Chat-Summary 关联:窗口内右上 entry(2 commits)

跟 chat 主区强关联(WKLayout 等)虽然实际改 summary 模块。

- [ ] `f27fbdd2` 2026-06-05 feat: chat-window smart summary UI with i18n — **chat 主区右上 entry,33+ files**
- [ ] `123a12c6` 2026-06-02 fix(#192): smart summary session list auto-refresh + NavRail badge

**手测**:进 chat 窗口右上看到 summary entry;NavRail summary 有未读 badge;session list 实时刷新。

---

### Batch 1.12 — Chat-Matter 关联:多选事项 / 文件 tab(2 commits)

跟 chat 多选 → 事项 / 文件预览交集。

- [ ] `66d474c9` 2026-06-03 refactor(todo): unify create-task modal — all entries use SmartCreate
- [ ] `60afb75e` 2026-05-28 feat(matters): add 产出文件 tab to matter detail panel

**手测**:任意入口创建事项都走 SmartCreateModal;matter 详情有"产出文件" tab。

---

### Batch 1.13 — 杂项小 fix(3 commits)

- [ ] `0f024d2d` 2026-06-04 fix(group-md): render escaped newlines as markdown — GroupMdEditor
- [ ] `12e579a4` 2026-06-03 fix: restore MeInfo modal content height
- [ ] `1906c874` 2026-06-08 fix: unify thread archive action visibility across entries

**手测**:GroupMd 里 \\n 渲染换行;MeInfo modal 高度正常;子区归档按钮一致。

---

### Batch 1.14 — Conversation 大特性:drag-drop / 多选(2 commits)

- [ ] `361447b6` 2026-06-04 feat(conversation): widen drag-drop hit area + file-size guard + edge-case hardening
- [ ] `930b8fa5` 2026-06-02 fix: unify message multiselect behavior

**手测**:文件拖拽 hit area 大;超大文件被拦;多选模式跨场景行为一致(fold session / 普通)。

---

## P1 — Login 模块(中优)

独立模块,跟主线 chat/contact 关联弱,但全局影响登录入口。

- [ ] `5ef5150f` 2026-05-22 feat(login): SSO panel redesign per Figma + theme-token compliance
- [ ] `1bf42ba2` 2026-05-23 fix(login): breathe out the non-SSO panel layout
- [ ] `2d4d4d51` 2026-05-27 Update Octo login button copy
- [ ] `7de93ff1` 2026-05-30 feat(login): add Aegis migration notice
- [ ] `86c5837b` 2026-06-02 fix: complete OIDC logout flow
- [ ] `89d56e35` 2026-06-02 fix(web): add logout path to no-space pages
- [ ] `43e7d354` 2026-05-29 feat: support disabling user space creation

**预期工作量**:中,Login 模块独立。

---

## P2 — Backlog(记录,先不做)

3 个模块本身没复刻好,等模块复刻完再回头搬增量;现在只记录避免遗忘。

### Matter 独立(2 commits)

- 〇 `f2d723fb` 2026-05-29 feat(matters): tidy timeline rendering + render attachments preview/download
- 〇 `01cd20a1` 2026-05-28 feat(matters): support linking threads (子区) in addition to groups

### Summary 独立(2 commits)

- 〇 `85687e19` 2026-06-08 feat: allow editing topic on regenerate (smart-summary#70)
- 〇 `df1557a4` 2026-06-05 feat: raise chat selection limit from 10 to 30

### Persona 独立(3 commits)

- 〇 `0e494e60` 2026-05-25 fix(persona): bot picker — filter myBotsRaw by creator_uid
- 〇 `bce18fbe` 2026-05-23 feat(meinfo): hide persona settings behind experimental features
- 〇 `c0319928` 2026-05-22 fix(persona): PersonaCreate subscribes to VM notifyListener fan-out

### AppBot(1 commit)

- 〇 `7d4800a3` 2026-05-27 Fix app bot nav icon color

---

## 跳过 — CI / ISSUE_TEMPLATE / Docs(28 commits)

`Mininglamp-OSS` 仓库治理相关,本仓有自己的 harness/CI,不搬。注意 `7d1806b5 docs: add CLAUDE.md for AI agent coding guidance` 本仓也有 CLAUDE.md,**可选**参考上游内容(但本仓针对 miaoa-fe-harness 写,大概率不冲突)。

### Files-only(跳)

`f8302652` `97983d9e` `93c93b3e` `3ff271dc` `874e6c7d` `52af7256` `2e84fc2e` `7d1806b5` `13b714f5` `9da23ad5` `05dd11e1` `247e1a41` `23a7c244` `2cb9ab52` `81ee67ed` `933a028f` `69a322a7` `c271d50d` `6a18a22f` `534d7d7f` `f9b6fab8` `860c3335` `3ecbec72` `5c17ac9d` `0f6ff97f`(space prefill,放 chat 已涵盖) `8e0c8166` `b04a0618`(WKModal,已在 1.6)

---

## 流程

**关键约定:每个 batch 合并后只更新 plan checkbox,不重新跑 audit / 不拉远程。**

理由(陈超 2026-06-08):上游频繁更新,每个 batch 完都 fetch + 调整 plan 太费劲。本 plan 锁定的 109 commits 视为"已审视过",依据是出 plan 时的 audit snapshot
(`docs/upstream-audit.md` 文件本身就是那次 snapshot)。Backlog / 跳过的 commits 在本 checkbox 里 tracked,**不依赖 audit md 自动跟踪**。

**只有陈超显式说"拉远程更新"时才做**:

- `pnpm scan:upstream --out docs/upstream-audit.md` 覆盖 snapshot
- 推进 sync-log.md 头部 `baseline SHA` 到当时 upstream HEAD
- 出 batch 2 plan(新清单 = 上游新增的 + batch 1 未完成的 P2 backlog)

### Batch 内部流程

1. 选定 batch 编号(如 1.1)→ 基于 origin/main 新建分支(如 `feat/upstream-i18n`)
2. 按清单逐 commit 实现 + `pnpm vp check` 0 errors
3. push + 创 MR,MR 描述带本 batch checkbox 进度
4. 陈超手测验证 → 提 review 意见 → AI 修(同 branch 续 commit)
5. **验证通过后**,AI 把以下 2 个改动 push 到**同一 MR**(无需另开 PR):
   - 本文件对应 batch 行 `[ ]` → `[x]`(跳过/不适用的标 `[~]` + 一行解释)
   - `docs/sync-log.md` 追加一段"Batch X.Y 搬了 N 个 SHA,新仓 commits = ...,跳过 M 个(原因)"
6. 陈超合并 MR — 一次性把代码 + plan 状态一起进 main。
7. **不动** `docs/upstream-audit.md`(snapshot 锁定),**不动** sync-log 头部 `baseline SHA`(等显式"拉远程更新"才动)

> **流程变更记录**(2026-06-08):原 step 4 是"合并后只动两个文件"(分两次进 main)。陈超提出 plan checkbox 应跟代码 commit 一起合并到 main,避免合并后还要补单独 PR 更新 plan 状态。新流程减少一次切换 + 让 checkbox 真实反映"已验证+已合并"状态。
